import { beforeEach, describe, expect, it } from 'vitest';
import { WorkDayService } from '../../src/lib/server/crm-payroll/work-day.service';
import { WorkEntryCrewRepository } from '../../src/lib/server/crm-payroll/work-entry-crew.repository';
import {
	workDayStaff,
	workDays,
	workEntries,
	workEntryStaff
} from '../../src/lib/server/db/schema';
import {
	calendarAt,
	clearPayroll,
	insertStaff,
	insertWorkType,
	payrollActor
} from './helpers/crm-payroll';
import { insertUser, migratedDatabase } from './helpers/db';

const db = migratedDatabase();
const managerId = insertUser({
	email: 'manager@ws.example',
	role: 'manager',
	counterpartyId: null
});
const actor = payrollActor(managerId);
const NOW = '2026-10-07T09:00:00Z';
const TODAY = '2026-10-07';
const days = () => new WorkDayService(actor, calendarAt(NOW));
const backfill = () => new WorkEntryCrewRepository().backfill();

let anna = 0;
let boris = 0;
let viktor = 0;
let boxes = 0;

/** A day as v1.48 wrote it: people and works, no crews. */
function insertOldDay(date: string, staffIds: number[], qty: number): number {
	const workDate = calendarAt(NOW).instantOf(date);
	const [day] = db
		.insert(workDays)
		.values({ workDate, totalMinor: qty * 20_000, createdById: managerId })
		.returning()
		.all();
	if (!day) throw new Error('failed to insert an old day');
	db.insert(workDayStaff)
		.values(staffIds.map((staffId) => ({ workDayId: day.id, staffId })))
		.run();
	db.insert(workEntries)
		.values({
			workDayId: day.id,
			workTypeId: boxes,
			qty,
			rateMinor: 20_000,
			amountMinor: qty * 20_000
		})
		.run();
	return day.id;
}

beforeEach(() => {
	clearPayroll();
	anna = insertStaff('Анна');
	boris = insertStaff('Борис');
	viktor = insertStaff('Виктор');
	boxes = insertWorkType('Сборка ящика', 20_000);
});

describe('payroll:backfill-crews (tech.md v1.55)', () => {
	it('gives an old entry everyone of its day, so the day pays what v1.48 paid', () => {
		insertOldDay(TODAY, [anna, boris, viktor], 10);
		expect(
			days()
				.get(TODAY)
				.shares.map((row) => row.shareMinor)
		).toEqual([0, 0, 0]);

		expect(backfill()).toBe(1);
		const day = days().get(TODAY);
		expect(day.entries[0]?.staffIds).toEqual([anna, boris, viktor]);
		// 2000 / 3 = 666,67 goes down to a whole rouble, as the v1.48 share did.
		expect(day.shares.map((row) => row.shareMinor)).toEqual([66_600, 66_600, 66_600]);
	});

	it('changes nothing on a second run', () => {
		insertOldDay(TODAY, [anna, boris], 2);
		insertOldDay('2026-10-06', [viktor], 1);
		expect(backfill()).toBe(2);
		const crews = db.select().from(workEntryStaff).all();

		expect(backfill()).toBe(0);
		expect(db.select().from(workEntryStaff).all()).toEqual(crews);
	});

	it('leaves an entry that already has its crew alone', () => {
		days().save({
			date: TODAY,
			staffIds: [anna, boris],
			entries: [{ workTypeId: boxes, qty: 1, staffIds: [anna] }]
		});
		expect(backfill()).toBe(0);
		expect(days().get(TODAY).entries[0]?.staffIds).toEqual([anna]);
	});
});
