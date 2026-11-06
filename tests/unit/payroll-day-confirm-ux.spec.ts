import { eq } from 'drizzle-orm';
import { beforeEach, expect, it } from 'vitest';
import { shopUnitWorks, workTypes } from '../../src/lib/server/db/schema';
import {
	db,
	world,
	DAY,
	units,
	days,
	confirm,
	job,
	staffOf,
	resetUnitPayroll
} from './helpers/shop-unit-payroll';

beforeEach(resetUnitPayroll);

it('saves the visible crew and manual work before confirming in one operation', () => {
	const row = job();
	units().take(row.units[0]!.id);
	units().complete(row.units[0]!.id);
	const own = staffOf(world.ids.carpenter);
	const work = db.select().from(workTypes).where(eq(workTypes.roleCode, 'carpenter')).get()!;
	const input = {
		date: DAY,
		staffIds: [own],
		carpenterStaffIds: [own],
		entries: [{ workTypeId: work.id, qty: 1, staffIds: [own] }]
	};
	expect(() => confirm().confirm(DAY, input)).not.toThrow();
	expect(days().get(DAY)).toMatchObject({
		totalMinor: 170_000,
		pendingCount: 0,
		carpenterStaffIds: [own],
		entries: [{ amountMinor: 85_000 }],
		autoEntries: [{ amountMinor: 85_000 }]
	});
	confirm().confirm(DAY, input);
	expect(days().get(DAY).totalMinor).toBe(170_000);
});

it('rolls the day save back when confirmation cannot complete', () => {
	const row = job();
	units().take(row.units[0]!.id);
	units().complete(row.units[0]!.id);
	const own = staffOf(world.ids.carpenter);
	expect(() =>
		confirm().confirm(DAY, { date: DAY, staffIds: [own], carpenterStaffIds: [], entries: [] })
	).toThrow('бригаду');
	expect(days().get(DAY)).toMatchObject({ presentCount: 0, pendingCount: 1, autoEntries: [] });
	expect(db.select().from(shopUnitWorks).all()[0]?.confirmedAt).toBeNull();
});
