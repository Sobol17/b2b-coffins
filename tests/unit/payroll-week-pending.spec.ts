import { eq } from 'drizzle-orm';
import { beforeEach, expect, it } from 'vitest';
import { PayrollWeekService } from '../../src/lib/server/crm-payroll/payroll-week.service';
import { workTypes } from '../../src/lib/server/db/schema';
import {
	db,
	world,
	DAY,
	calendar,
	units,
	confirm,
	job,
	resetUnitPayroll
} from './helpers/shop-unit-payroll';

beforeEach(resetUnitPayroll);

it('shows unfinished confirmation even on an unmarked payroll day', () => {
	const row = job('grinder');
	units(world.actors.grinder).take(row.units[0]!.id);
	units(world.actors.grinder).complete(row.units[0]!.id);
	const week = () => new PayrollWeekService(world.actors.manager, calendar()).week(DAY);
	expect(week().days.find((day) => day.date === DAY)).toMatchObject({
		presentCount: 0,
		totalMinor: 0,
		pendingCount: 1,
		pendingTotalMinor: 40_000
	});
	confirm().confirm(DAY);
	expect(week().days.find((day) => day.date === DAY)).toMatchObject({
		totalMinor: 40_000,
		pendingCount: 0,
		pendingTotalMinor: 0
	});
});

it('counts a zero-rate completed work in the confirmation queue', () => {
	db.update(workTypes).set({ rateMinor: 0 }).where(eq(workTypes.roleCode, 'grinder')).run();
	const row = job('grinder');
	units(world.actors.grinder).take(row.units[0]!.id);
	units(world.actors.grinder).complete(row.units[0]!.id);
	expect(
		new PayrollWeekService(world.actors.manager, calendar())
			.week(DAY)
			.days.find((day) => day.date === DAY)
	).toMatchObject({ pendingCount: 1, pendingTotalMinor: 0 });
});
