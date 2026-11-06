import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { PayrollCloseService } from '../../src/lib/server/crm-payroll/payroll-close.service';
import { ShopTaskService } from '../../src/lib/server/crm-shop/shop-task.service';
import { ShopService } from '../../src/lib/server/crm-shop/shop.service';
import { ShopLineReader } from '../../src/lib/server/crm-shop/shop-lines';
import { staff, shopUnitWorks, workTypes } from '../../src/lib/server/db/schema';
import { WORK_ROLES } from '../../src/lib/types/roles';
import { insertStaff } from './helpers/crm-payroll';
import {
	db,
	world,
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

describe('review regressions in unit payroll', () => {
	it('does not report a claimed unit as completed on the CRM card', () => {
		const row = job();
		const itemId = new ShopService(world.actors.carpenter).task(row.taskId).jobs[0]!.itemId;
		units().take(row.units[0]!.id);
		const card = new ShopLineReader().forRequest({ id: row.requestId, status: 'in_work' }, [
			itemId
		]);
		expect(card[0]?.stations[0]?.doneQty).toBe(0);
	});

	it('keeps the manual frozen rate when the same type has later automatic earnings', () => {
		const row = job();
		units().take(row.units[0]!.id);
		const own = staffOf(world.ids.carpenter);
		const work = db.select().from(workTypes).where(eq(workTypes.roleCode, 'carpenter')).get()!;
		db.update(workTypes).set({ rateMinor: 10_000 }).where(eq(workTypes.id, work.id)).run();
		const input = {
			date: DAY,
			staffIds: [own],
			carpenterStaffIds: [own],
			entries: [{ workTypeId: work.id, qty: 1, staffIds: [own] }]
		};
		days().save(input);
		db.update(workTypes).set({ rateMinor: 20_000 }).where(eq(workTypes.id, work.id)).run();
		units().complete(row.units[0]!.id);
		confirm().confirm(DAY);
		days().save(input);
		expect(days().get(DAY)).toMatchObject({
			totalMinor: 30_000,
			entries: [{ rateMinor: 10_000 }],
			autoEntries: [{ rateMinor: 20_000 }]
		});
	});

	it('lets the administrator count the next station without erasing earlier work', () => {
		const row = job();
		units().take(row.units[0]!.id);
		units().complete(row.units[0]!.id);
		new ShopTaskService(world.actors.carpenter).complete(row.taskId);
		const next = world.jobsOf(row.requestId)[0]!;
		expect(() =>
			new ShopTaskService(world.actors.manager).progress({ jobId: next.id, doneQty: 1 })
		).not.toThrow();
		expect(world.jobsOf(row.requestId)[0]?.doneQty).toBe(1);
		expect(db.select().from(shopUnitWorks).all()).toHaveLength(1);
	});

	it('returns a zero personal line for a linked worker absent from a frozen week', () => {
		const row = job();
		units().take(row.units[0]!.id);
		const own = staffOf(world.ids.carpenter);
		days().save({ date: DAY, staffIds: [insertStaff('Другой работник')], entries: [] });
		new PayrollCloseService(world.actors.manager, calendar()).close(DAY);
		expect(salary().week(DAY)).toMatchObject({
			week: { status: 'calculated' },
			line: { staffId: own, accruedMinor: 0, payoutMinor: 0 }
		});
	});

	it('keeps pending pay visible for an inactive linked worker', () => {
		const row = job('grinder');
		const worker = world.actors.grinder;
		units(worker).take(row.units[0]!.id);
		units(worker).complete(row.units[0]!.id);
		const own = staffOf(world.ids.grinder);
		db.update(staff).set({ isActive: false }).where(eq(staff.id, own)).run();
		expect(salary(worker).week(DAY)).toMatchObject({
			pendingMinor: 40_000,
			line: { staffId: own, accruedMinor: 0 }
		});
	});

	it('exposes all executors of the same unit on the CRM card after production finishes', () => {
		const row = job();
		const id = row.units[0]!.id;
		const itemId = new ShopService(world.actors.carpenter).task(row.taskId).jobs[0]!.itemId;
		for (const roleCode of ['painter', 'upholsterer'] as const)
			db.insert(workTypes)
				.values({ title: roleCode, roleCode, variantId: world.volga, rateMinor: 10_000 })
				.run();
		for (const station of WORK_ROLES) {
			const actor = world.actors[station];
			const current = world.jobsOf(row.requestId)[0]!;
			units(actor).take(id);
			units(actor).complete(id);
			new ShopTaskService(actor).complete(current.taskId);
		}
		const card = new ShopLineReader().forRequest({ id: row.requestId, status: 'ready' }, [itemId]);
		expect(card[0]).toMatchObject({
			units: [
				{
					id,
					works: WORK_ROLES.map((station) => ({
						station,
						fullName: expect.any(String),
						completedAt: expect.any(String)
					}))
				}
			]
		});
	});
});
