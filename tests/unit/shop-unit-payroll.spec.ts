import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError } from '../../src/lib/server/core/errors';
import { ShopService } from '../../src/lib/server/crm-shop/shop.service';
import { ShopTaskService } from '../../src/lib/server/crm-shop/shop-task.service';
import { ShopUnitService } from '../../src/lib/server/crm-shop/shop-unit.service';
import { WorkDayConfirmService } from '../../src/lib/server/crm-payroll/work-day-confirm.service';
import { WorkDayService } from '../../src/lib/server/crm-payroll/work-day.service';
import { OwnPayrollService } from '../../src/lib/server/crm-payroll/own-payroll.service';
import { PayrollCloseService } from '../../src/lib/server/crm-payroll/payroll-close.service';
import { PayrollWeekService } from '../../src/lib/server/crm-payroll/payroll-week.service';
import {
	shopTasks,
	shopUnitWorks,
	shopUnits,
	staff,
	workEntries,
	workTypes
} from '../../src/lib/server/db/schema';
import { seedShopWorld } from './helpers/crm-shop';
import { calendarAt, clearPayroll, insertStaff } from './helpers/crm-payroll';
import { insertUser, migratedDatabase } from './helpers/db';
import { crmActor, resetRequests } from './helpers/portal-requests';

const db = migratedDatabase();
const world = seedShopWorld(db, 'units');
const second = crmActor(
	'carpenter',
	insertUser({
		email: 'second@units.example',
		role: 'carpenter',
		counterpartyId: null,
		fullName: 'Другой столяр'
	})
);
const DAY = '2026-10-11';
const calendar = () => calendarAt('2026-10-11T15:00:00Z');
const units = (actor = world.actors.carpenter) => new ShopUnitService(actor, calendar());
const days = () => new WorkDayService(world.actors.manager, calendar());
const confirm = () => new WorkDayConfirmService(world.actors.manager, calendar());
const salary = (actor = world.actors.carpenter) => new OwnPayrollService(actor, calendar());

function job(station: 'carpenter' | 'grinder' = 'carpenter', qty = 1) {
	const id = world.forStock(qty);
	const [row] = world.jobsOf(id);
	if (!row) throw new Error('missing test job');
	if (station !== 'carpenter')
		db.update(shopTasks).set({ station }).where(eq(shopTasks.id, row.taskId)).run();
	const actor = station === 'carpenter' ? world.actors.carpenter : world.actors.grinder;
	const task = new ShopService(actor).task(row.taskId);
	return { ...row, requestId: id, units: task.jobs[0]?.units ?? [] };
}

function staffOf(userId: number): number {
	const row = db.select().from(staff).where(eq(staff.userId, userId)).get();
	if (!row) throw new Error('missing linked staff');
	return row.id;
}

beforeEach(() => {
	db.delete(workEntries).run();
	db.delete(shopUnitWorks).run();
	db.delete(shopUnits).run();
	resetRequests(db);
	clearPayroll();
	for (const [roleCode, rateMinor] of [
		['carpenter', 85_000],
		['grinder', 40_000]
	] as const) {
		db.insert(workTypes)
			.values({ title: `Расценка ${roleCode}`, roleCode, rateMinor, variantId: world.volga })
			.run();
	}
});

describe('one physical unit at a station', () => {
	it('gives different pieces to two people and atomically refuses a second claimant', () => {
		const row = job('carpenter', 2);
		const [first, next] = row.units;
		expect(row.units).toHaveLength(2);
		units().take(first!.id);
		units().take(first!.id);
		expect(() => units(second).take(first!.id)).toThrow(ConflictError);
		units(second).take(next!.id);
		expect(db.select().from(shopUnitWorks).all()).toHaveLength(2);
		expect(() => units(second).complete(first!.id)).toThrow(ForbiddenError);
		expect(() => units(world.actors.grinder).take(first!.id)).toThrow(ForbiddenError);
	});

	it('freezes the position rate once and keeps the unit identity at the next station', () => {
		const row = job();
		const id = row.units[0]!.id;
		units().take(id);
		units().complete(id);
		units().complete(id);
		db.update(workTypes).set({ rateMinor: 1_000 }).run();
		expect(db.select().from(shopUnitWorks).get()).toMatchObject({ rateMinor: 85_000 });
		new ShopTaskService(world.actors.carpenter).complete(row.taskId);
		const next = world.jobsOf(row.requestId)[0]!;
		const read = new ShopService(world.actors.grinder).task(next.taskId);
		expect(read.jobs[0]?.units[0]).toMatchObject({ id, canTake: true, completedAt: null });
		expect(salary().week(DAY).pendingMinor).toBe(0);
	});

	it('rejects completion with no configured rate without changing progress', () => {
		const row = job();
		units().take(row.units[0]!.id);
		db.update(workTypes).set({ isActive: false }).run();
		expect(() => units().complete(row.units[0]!.id)).toThrow(ConflictError);
		expect(world.jobsOf(row.requestId)[0]?.doneQty).toBe(0);
		expect(db.select().from(shopUnitWorks).get()?.completedAt).toBeNull();
	});

	it('prevents checkbox progress from bypassing a claim', () => {
		const row = job();
		expect(() =>
			new ShopTaskService(world.actors.carpenter).progress({ jobId: row.id, doneQty: 1 })
		).toThrow(ConflictError);
		expect(world.jobsOf(row.requestId)[0]?.doneQty).toBe(0);
	});
});

describe('automatic earnings and daily confirmation', () => {
	it('shares carpenter earnings with the marked crew and confirms them exactly once', () => {
		const row = job();
		units().take(row.units[0]!.id);
		units().complete(row.units[0]!.id);
		const own = staffOf(world.ids.carpenter);
		const other = insertStaff('Второй столяр');
		days().save({
			date: DAY,
			staffIds: [own, other],
			carpenterStaffIds: [own, other],
			entries: []
		});
		expect(salary().week(DAY)).toMatchObject({ pendingMinor: 42_500, line: { accruedMinor: 0 } });
		expect(() => new PayrollCloseService(world.actors.manager, calendar()).close(DAY)).toThrow(
			ConflictError
		);
		confirm().confirm(DAY);
		confirm().confirm(DAY);
		expect(db.select().from(workEntries).all()).toHaveLength(1);
		expect(
			new PayrollWeekService(world.actors.manager, calendar())
				.week(DAY)
				.lines.map((r) => r.accruedMinor)
		).toEqual([42_500, 42_500]);
		expect(salary().week(DAY)).toMatchObject({ pendingMinor: 0, line: { accruedMinor: 42_500 } });
		expect(() =>
			days().save({ date: DAY, staffIds: [own, other], carpenterStaffIds: [own], entries: [] })
		).toThrow(ConflictError);
	});

	it('credits the grinder only and keeps automatic entries after a manual save', () => {
		const row = job('grinder');
		const service = units(world.actors.grinder);
		service.take(row.units[0]!.id);
		service.complete(row.units[0]!.id);
		expect(salary(world.actors.grinder).week(DAY).pendingMinor).toBe(40_000);
		confirm().confirm(DAY);
		const own = staffOf(world.ids.grinder);
		days().save({ date: DAY, staffIds: [own], carpenterStaffIds: [], entries: [] });
		expect(salary(world.actors.grinder).week(DAY).line?.accruedMinor).toBe(40_000);
		expect(db.select().from(workEntries).all()).toHaveLength(1);
		expect(salary().week(DAY).line).toBeNull();
		expect(() => salary(world.actors.admin)).toThrow(ForbiddenError);
		expect(() => new WorkDayConfirmService(world.actors.grinder, calendar())).toThrow(
			ForbiddenError
		);
	});

	it('does not partially confirm the day when the carpenter crew is missing', () => {
		const row = job();
		units().take(row.units[0]!.id);
		units().complete(row.units[0]!.id);
		expect(() => confirm().confirm(DAY)).toThrow(ConflictError);
		expect(db.select().from(workEntries).all()).toHaveLength(0);
		expect(db.select().from(shopUnitWorks).get()?.confirmedAt).toBeNull();
	});
});
