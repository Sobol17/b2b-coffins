import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError } from '../../src/lib/server/core/errors';
import { ShopService } from '../../src/lib/server/crm-shop/shop.service';
import { ShopTaskService } from '../../src/lib/server/crm-shop/shop-task.service';
import { WorkDayConfirmService } from '../../src/lib/server/crm-payroll/work-day-confirm.service';
import { PayrollCloseService } from '../../src/lib/server/crm-payroll/payroll-close.service';
import { PayrollWeekService } from '../../src/lib/server/crm-payroll/payroll-week.service';
import { CrmRequestItemsService } from '../../src/lib/server/crm-request/crm-request-items.service';
import { auditLog, shopUnitWorks, workEntries, workTypes } from '../../src/lib/server/db/schema';
import { insertStaff } from './helpers/crm-payroll';
import {
	db,
	world,
	second,
	DAY,
	calendar,
	units,
	days,
	confirm,
	salary,
	job,
	staffOf,
	resetUnitPayroll
} from './helpers/shop-unit-payroll';

beforeEach(resetUnitPayroll);

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
		expect(
			db.select().from(auditLog).where(eq(auditLog.action, 'shop.unit.take')).all()
		).toHaveLength(2);
		expect(() => units(second).complete(first!.id)).toThrow(ForbiddenError);
		expect(() => units(world.actors.grinder).take(first!.id)).toThrow(ForbiddenError);
	});

	it('freezes the position rate once and keeps the unit identity at the next station', () => {
		const row = job();
		const id = row.units[0]!.id;
		units().take(id);
		units().complete(id);
		units().complete(id);
		expect(salary().week(DAY).pending).toMatchObject([{ unitId: id, shareMinor: 0 }]);
		expect(
			db.select().from(auditLog).where(eq(auditLog.action, 'shop.unit.complete')).all()
		).toHaveLength(1);
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

	it('keeps the claimed unit when a shelf purchase removes the free surplus', () => {
		const requestId = world.inWork(2);
		const current = world.jobsOf(requestId)[0]!;
		const before = new ShopService(world.actors.carpenter).task(current.taskId).jobs[0]!.units;
		const held = before[1]!.id;
		units().take(held);
		world.purchase(2);
		expect(world.jobsOf(requestId)[0]?.qty).toBe(1);
		expect(
			new ShopService(world.actors.carpenter).task(current.taskId).jobs[0]!.units.map((u) => u.id)
		).toEqual([held]);
	});

	it('keeps both unit identities when two batches merge at the next station', () => {
		const row = job();
		const first = row.units[0]!.id;
		units().take(first);
		units().complete(first);
		new ShopTaskService(world.actors.carpenter).complete(row.taskId);
		const firstGrinder = world.jobsOf(row.requestId)[0]!;
		const itemId = new ShopService(world.actors.grinder).task(firstGrinder.taskId).jobs[0]!.itemId;
		new CrmRequestItemsService(world.actors.manager).setQty(row.requestId, {
			itemId,
			qty: 2,
			comment: 'Ещё один ящик'
		});
		const carpenter = world.jobsOf(row.requestId).find((j) => j.station === 'carpenter')!;
		const secondId = new ShopService(world.actors.carpenter).task(carpenter.taskId).jobs[0]!
			.units[0]!.id;
		units().take(secondId);
		units().complete(secondId);
		new ShopTaskService(world.actors.carpenter).complete(carpenter.taskId);
		const merged = new ShopService(world.actors.grinder).task(firstGrinder.taskId).jobs[0]!;
		expect(merged.units.map((u) => u.id)).toEqual([first, secondId]);
		expect(merged.units.every((u) => u.canTake)).toBe(true);
	});
});

describe('automatic earnings and daily confirmation', () => {
	it('rounds the pending increment together with work already confirmed for the day', () => {
		db.update(workTypes).set({ rateMinor: 10_000 }).run();
		const row = job('carpenter', 3);
		for (const piece of row.units) units().take(piece.id);
		const own = staffOf(world.ids.carpenter);
		const crew = [own, insertStaff('Второй'), insertStaff('Третий')];
		days().save({ date: DAY, staffIds: crew, carpenterStaffIds: crew, entries: [] });
		units().complete(row.units[0]!.id);
		confirm().confirm(DAY);
		for (const piece of row.units.slice(1)) units().complete(piece.id);
		expect(salary().week(DAY)).toMatchObject({
			line: { accruedMinor: 3_300 },
			pendingMinor: 6_700
		});
		confirm().confirm(DAY);
		expect(salary().week(DAY)).toMatchObject({ line: { accruedMinor: 10_000 }, pendingMinor: 0 });
	});

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
