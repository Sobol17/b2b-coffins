import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { PayrollCloseService } from '../../src/lib/server/crm-payroll/payroll-close.service';
import {
	shopUnitWorks,
	staff,
	workDayStaff,
	workEntries,
	workTypes
} from '../../src/lib/server/db/schema';
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

describe('own payroll work journal', () => {
	it('distinguishes an unknown carpenter share from a real zero rate', () => {
		const first = job();
		units().take(first.units[0]!.id);
		units().complete(first.units[0]!.id);
		db.update(workTypes).set({ rateMinor: 0 }).run();
		const zero = job();
		units().take(zero.units[0]!.id);
		units().complete(zero.units[0]!.id);
		expect(salary().week(DAY)).toMatchObject({
			pendingMinor: 0,
			works: [
				{ unitId: first.units[0]!.id, workDate: DAY, shareMinor: null, status: 'awaiting_crew' },
				{ unitId: zero.units[0]!.id, shareMinor: 0, status: 'awaiting_confirmation' }
			]
		});
	});

	it('keeps row rounding separate from the final daily rounding', () => {
		db.update(workTypes).set({ rateMinor: 10_000 }).run();
		const row = job('carpenter', 3);
		for (const piece of row.units) {
			units().take(piece.id);
			units().complete(piece.id);
		}
		const crew = [staffOf(world.ids.carpenter), insertStaff('Второй'), insertStaff('Третий')];
		days().save({ date: DAY, staffIds: crew, carpenterStaffIds: crew, entries: [] });
		expect(
			salary()
				.week(DAY)
				.works.map((work) => work.shareMinor)
		).toEqual([3_300, 3_300, 3_300]);
		expect(salary().week(DAY).pendingMinor).toBe(10_000);
		confirm().confirm(DAY);
		expect(salary().week(DAY)).toMatchObject({
			line: { accruedMinor: 10_000 },
			pending: [],
			works: row.units.map(({ id }) => ({ unitId: id, shareMinor: 3_300, status: 'confirmed' }))
		});
	});

	it('preserves confirmed work and changes its status only on the own payout', () => {
		const row = job('grinder');
		const actor = world.actors.grinder;
		units(actor).take(row.units[0]!.id);
		units(actor).complete(row.units[0]!.id);
		confirm().confirm(DAY);
		const close = new PayrollCloseService(world.actors.manager, calendar());
		close.close(DAY);
		expect(salary(actor).week(DAY).works).toMatchObject([
			{ shareMinor: 40_000, status: 'confirmed' }
		]);
		const line = salary(actor).week(DAY).line!;
		close.pay({ lineId: line.id!, comment: 'Выдано' });
		expect(salary(actor).week(DAY)).toMatchObject({
			line: { paidAt: expect.any(String) },
			pending: [],
			works: [{ unitId: row.units[0]!.id, shareMinor: 40_000, status: 'paid' }]
		});
		close.unpay(line.id!);
		expect(salary(actor).week(DAY).works[0]?.status).toBe('confirmed');
	});

	it('reads confirmed carpenter shares and membership from the frozen entry crew', () => {
		const row = job();
		units().take(row.units[0]!.id);
		units().complete(row.units[0]!.id);
		const otherJob = job();
		units(second).take(otherJob.units[0]!.id);
		const own = staffOf(world.ids.carpenter);
		const other = staffOf(second.userId);
		const crew = [own, other];
		days().save({ date: DAY, staffIds: crew, carpenterStaffIds: crew, entries: [] });
		expect(salary(second).week(DAY).works).toMatchObject([
			{ unitId: row.units[0]!.id, shareMinor: 42_500, status: 'awaiting_confirmation' }
		]);
		confirm().confirm(DAY);
		// A defensive read must use the frozen crew even if the current day is later inconsistent.
		db.update(workDayStaff).set({ isCarpenter: false }).run();
		db.update(workTypes).set({ rateMinor: 999_900 }).run();
		db.update(shopUnitWorks).set({ rateMinor: 888_800 }).run();
		expect(salary(second).week(DAY).works).toMatchObject([
			{ unitId: row.units[0]!.id, shareMinor: 42_500, status: 'confirmed' }
		]);
	});

	it('keeps the actual claimant history without awarding another crew member share', () => {
		const row = job();
		units().take(row.units[0]!.id);
		units().complete(row.units[0]!.id);
		const crew = [insertStaff('Исполнитель бригады')];
		days().save({ date: DAY, staffIds: crew, carpenterStaffIds: crew, entries: [] });
		confirm().confirm(DAY);
		expect(salary().week(DAY).works).toMatchObject([{ shareMinor: 0, status: 'confirmed' }]);
	});

	it('omits unrelated work and work outside the selected week, including newly added crews', () => {
		const row = job('carpenter', 2);
		units().take(row.units[0]!.id);
		units(second).take(row.units[1]!.id);
		units(second).complete(row.units[1]!.id);
		expect(salary().week(DAY).works).toEqual([]);
		const own = staffOf(world.ids.carpenter);
		const other = staffOf(second.userId);
		days().save({ date: DAY, staffIds: [own, other], carpenterStaffIds: [other], entries: [] });
		confirm().confirm(DAY);
		db.update(workDayStaff).set({ isCarpenter: true }).where(eq(workDayStaff.staffId, own)).run();
		expect(salary().week(DAY).works).toEqual([]);
		expect(salary(second).week('2026-10-12').works).toEqual([]);
	});

	it('retains the journal for inactive staff with only descriptive and own money fields', () => {
		const row = job('grinder');
		const actor = world.actors.grinder;
		units(actor).take(row.units[0]!.id);
		units(actor).complete(row.units[0]!.id);
		db.update(staff)
			.set({ isActive: false })
			.where(eq(staff.id, staffOf(actor.userId)))
			.run();
		const [work] = salary(actor).week(DAY).works;
		expect(work).toEqual({
			unitId: row.units[0]!.id,
			productTitle: expect.any(String),
			station: 'grinder',
			workDate: DAY,
			completedAt: '2026-10-11T15:00:00.000Z',
			shareMinor: 40_000,
			status: 'awaiting_confirmation'
		});
		expect(salary().week(DAY).works).toEqual([]);
		expect(db.select().from(workEntries).all()).toEqual([]);
	});
});
