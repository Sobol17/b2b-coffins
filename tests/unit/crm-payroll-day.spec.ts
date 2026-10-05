import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, ValidationError } from '../../src/lib/server/core/errors';
import { PayrollCloseService } from '../../src/lib/server/crm-payroll/payroll-close.service';
import { WorkDayService } from '../../src/lib/server/crm-payroll/work-day.service';
import { WorkTypeService } from '../../src/lib/server/crm-payroll/work-type.service';
import { PayrollStaffService } from '../../src/lib/server/crm-payroll/payroll-staff.service';
import { auditLog, workDays } from '../../src/lib/server/db/schema';
import { workDaySaveSchema } from '../../src/lib/validation/crm-payroll';
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

// Wednesday 7 October 2026, noon in Moscow.
const NOW = '2026-10-07T09:00:00Z';
const TODAY = '2026-10-07';
const days = () => new WorkDayService(actor, calendarAt(NOW));

let anna = 0;
let boris = 0;
let viktor = 0;
let boxes = 0;
let sanding = 0;

beforeEach(() => {
	clearPayroll();
	anna = insertStaff('Анна');
	boris = insertStaff('Борис');
	viktor = insertStaff('Виктор');
	boxes = insertWorkType('Сборка ящика', 20_000);
	sanding = insertWorkType('Шлифовка', 8_000);
});

describe('a work day of the crew', () => {
	it('splits the business sample: 10 boxes at 200 roubles among three people', () => {
		const day = days().save({
			date: TODAY,
			staffIds: [anna, boris, viktor],
			entries: [{ workTypeId: boxes, qty: 10 }]
		});

		expect(day.totalMinor).toBe(200_000);
		expect(day.presentCount).toBe(3);
		// 2000 / 3 = 666,67 goes down to a whole rouble.
		expect(day.shareMinor).toBe(66_600);
		expect(day.entries).toEqual([
			{ workTypeId: boxes, title: 'Сборка ящика', qty: 10, rateMinor: 20_000, amountMinor: 200_000 }
		]);
		expect(day.staff.map((row) => row.present)).toEqual([true, true, true]);
	});

	it('shows an unmarked day with the active crew and nothing earned', () => {
		const day = days().get(TODAY);
		expect(day).toMatchObject({
			date: TODAY,
			weekStartsOn: '2026-10-05',
			periodStatus: 'open',
			canEdit: true,
			canCopyPrevious: false,
			presentCount: 0,
			totalMinor: 0,
			shareMinor: 0
		});
		expect(day.staff.map((row) => row.fullName)).toEqual(['Анна', 'Борис', 'Виктор']);
	});

	it('recounts the share when the people of the day change', () => {
		days().save({
			date: TODAY,
			staffIds: [anna, boris, viktor],
			entries: [{ workTypeId: boxes, qty: 10 }]
		});
		const day = days().save({
			date: TODAY,
			staffIds: [anna, boris],
			entries: [
				{ workTypeId: boxes, qty: 10 },
				{ workTypeId: sanding, qty: 5 }
			]
		});
		expect(day.totalMinor).toBe(240_000);
		expect(day.shareMinor).toBe(120_000);
		expect(db.select().from(workDays).all()).toHaveLength(1);
	});

	it('refuses works with nobody to split them among', () => {
		expect(() =>
			days().save({ date: TODAY, staffIds: [], entries: [{ workTypeId: boxes, qty: 1 }] })
		).toThrow(ValidationError);
	});

	it('keeps a day of people without works: they worked, the day made nothing', () => {
		const day = days().save({ date: TODAY, staffIds: [anna], entries: [] });
		expect(day).toMatchObject({ presentCount: 1, totalMinor: 0, shareMinor: 0 });
	});

	it('drops the day when both the people and the works are cleared', () => {
		days().save({ date: TODAY, staffIds: [anna], entries: [{ workTypeId: boxes, qty: 1 }] });
		days().save({ date: TODAY, staffIds: [], entries: [] });
		expect(db.select().from(workDays).all()).toEqual([]);
	});

	it('refuses a day in the future', () => {
		expect(() => days().save({ date: '2026-10-08', staffIds: [anna], entries: [] })).toThrow(
			ValidationError
		);
		expect(days().get('2026-10-08').canEdit).toBe(false);
	});

	it('refuses an unknown or switched-off worker and work', () => {
		const gone = insertStaff('Глеб', false);
		const retired = insertWorkType('Резьба', 50_000, false);
		expect(() => days().save({ date: TODAY, staffIds: [gone], entries: [] })).toThrow(
			ValidationError
		);
		expect(() => days().save({ date: TODAY, staffIds: [9999], entries: [] })).toThrow(
			ValidationError
		);
		expect(() =>
			days().save({ date: TODAY, staffIds: [anna], entries: [{ workTypeId: retired, qty: 1 }] })
		).toThrow(ValidationError);
		expect(() =>
			days().save({ date: TODAY, staffIds: [anna], entries: [{ workTypeId: 9999, qty: 1 }] })
		).toThrow(ValidationError);
	});

	it('keeps a worker switched off later on the day they worked', () => {
		days().save({ date: TODAY, staffIds: [anna, boris], entries: [{ workTypeId: boxes, qty: 2 }] });
		new PayrollStaffService(actor).setActive(boris, false);

		const day = days().save({
			date: TODAY,
			staffIds: [anna, boris],
			entries: [{ workTypeId: boxes, qty: 4 }]
		});
		expect(day.presentCount).toBe(2);
		expect(day.staff.map((row) => row.fullName)).toContain('Борис');
	});

	it('writes one audit row per save, with the figures and no names', () => {
		days().save({ date: TODAY, staffIds: [anna], entries: [{ workTypeId: boxes, qty: 3 }] });
		const rows = db.select().from(auditLog).all();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			action: 'payroll.day.save',
			entity: 'work_days',
			after: { date: TODAY, staffIds: [anna], totalMinor: 60_000, shareMinor: 60_000 }
		});
	});
});

describe('the price of a work is frozen in the day', () => {
	it('keeps the old price in an old entry and takes the new one for a new entry', () => {
		days().save({ date: TODAY, staffIds: [anna], entries: [{ workTypeId: boxes, qty: 10 }] });
		const works = new WorkTypeService(actor);
		works.update({ id: boxes, title: 'Сборка ящика', rateMinor: 25_000 });
		works.update({ id: sanding, title: 'Шлифовка', rateMinor: 9_000 });

		expect(days().get(TODAY).totalMinor).toBe(200_000);
		const resaved = days().save({
			date: TODAY,
			staffIds: [anna],
			entries: [
				{ workTypeId: boxes, qty: 12 },
				{ workTypeId: sanding, qty: 1 }
			]
		});
		expect(resaved.entries).toEqual([
			expect.objectContaining({ workTypeId: boxes, rateMinor: 20_000, amountMinor: 240_000 }),
			expect.objectContaining({ workTypeId: sanding, rateMinor: 9_000, amountMinor: 9_000 })
		]);

		const yesterday = days().save({
			date: '2026-10-06',
			staffIds: [anna],
			entries: [{ workTypeId: boxes, qty: 1 }]
		});
		expect(yesterday.totalMinor).toBe(25_000);
	});

	it('keeps a work switched off later in the day it was done on', () => {
		days().save({ date: TODAY, staffIds: [anna], entries: [{ workTypeId: sanding, qty: 2 }] });
		new WorkTypeService(actor).setActive(sanding, false);
		const day = days().save({
			date: TODAY,
			staffIds: [anna],
			entries: [{ workTypeId: sanding, qty: 3 }]
		});
		expect(day.totalMinor).toBe(24_000);
		expect(day.workTypes.map((row) => row.id)).toContain(sanding);
	});
});

describe('copying the previous day', () => {
	it('brings the people of the latest marked day and none of its works', () => {
		days().save({
			date: '2026-10-05',
			staffIds: [anna, viktor],
			entries: [{ workTypeId: boxes, qty: 4 }]
		});
		expect(days().get(TODAY).canCopyPrevious).toBe(true);

		const day = days().copyPrevious(TODAY);
		expect(day.staff.filter((row) => row.present).map((row) => row.fullName)).toEqual([
			'Анна',
			'Виктор'
		]);
		expect(day.entries).toEqual([]);
		expect(day.canCopyPrevious).toBe(false);
	});

	it('leaves out a worker switched off since', () => {
		days().save({ date: '2026-10-06', staffIds: [anna, boris], entries: [] });
		new PayrollStaffService(actor).setActive(boris, false);
		expect(days().copyPrevious(TODAY).presentCount).toBe(1);
	});

	it('refuses when the day has people or there is no earlier day', () => {
		expect(() => days().copyPrevious(TODAY)).toThrow(ValidationError);
		days().save({ date: '2026-10-06', staffIds: [anna], entries: [] });
		days().save({ date: TODAY, staffIds: [boris], entries: [] });
		expect(() => days().copyPrevious(TODAY)).toThrow(ValidationError);
	});
});

describe('a day of a closed week', () => {
	it('cannot be saved or copied into until the week is opened again', () => {
		days().save({ date: '2026-10-05', staffIds: [anna], entries: [{ workTypeId: boxes, qty: 1 }] });
		new PayrollCloseService(actor, calendarAt(NOW)).close(TODAY);

		expect(days().get(TODAY)).toMatchObject({ periodStatus: 'calculated', canEdit: false });
		expect(() => days().save({ date: TODAY, staffIds: [anna], entries: [] })).toThrow(
			ConflictError
		);
		expect(() => days().copyPrevious(TODAY)).toThrow(ConflictError);
		expect(days().get('2026-10-05').totalMinor).toBe(20_000);
	});
});

describe('the form of a day', () => {
	it('rejects a worker or a work named twice and a quantity out of range', () => {
		const base = { date: TODAY, staffIds: [1], entries: [] };
		expect(workDaySaveSchema.safeParse({ ...base, staffIds: [1, 1] }).success).toBe(false);
		expect(
			workDaySaveSchema.safeParse({
				...base,
				entries: [
					{ workTypeId: 1, qty: 1 },
					{ workTypeId: 1, qty: 2 }
				]
			}).success
		).toBe(false);
		for (const qty of [0, -1, 1.5, 10_001]) {
			expect(
				workDaySaveSchema.safeParse({ ...base, entries: [{ workTypeId: 1, qty }] }).success
			).toBe(false);
		}
		expect(workDaySaveSchema.safeParse({ ...base, date: '2026-02-31' }).success).toBe(false);
	});
});
