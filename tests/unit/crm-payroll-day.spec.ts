import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, ValidationError } from '../../src/lib/server/core/errors';
import { PayrollCloseService } from '../../src/lib/server/crm-payroll/payroll-close.service';
import { WorkDayService } from '../../src/lib/server/crm-payroll/work-day.service';
import { WorkTypeService } from '../../src/lib/server/crm-payroll/work-type.service';
import { PayrollStaffService } from '../../src/lib/server/crm-payroll/payroll-staff.service';
import { auditLog, workDays } from '../../src/lib/server/db/schema';
import { workDayFormSchema, workDaySaveSchema } from '../../src/lib/validation/crm-payroll';
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
let gleb = 0;
let boxes = 0;
let sanding = 0;

/** One work done by one worker alone: the cases where the crew is not the point. */
const solo = (workTypeId: number, qty: number, staffId: number) => ({
	workTypeId,
	qty,
	staffIds: [staffId]
});

beforeEach(() => {
	clearPayroll();
	anna = insertStaff('Анна');
	boris = insertStaff('Борис');
	viktor = insertStaff('Виктор');
	gleb = insertStaff('Глеб');
	boxes = insertWorkType('Сборка ящика', 20_000);
	sanding = insertWorkType('Шлифовка', 8_000);
});

describe('a work day: each work is split among the people who did it (v1.55)', () => {
	it('splits the customer sample: two of three joiners made a box for 850 roubles', () => {
		const joinery = insertWorkType('Столяр: любой ящик', 85_000);
		const painting = insertWorkType('Маляр: любой ящик', 40_000);
		const day = days().save({
			date: TODAY,
			staffIds: [anna, boris, viktor, gleb],
			entries: [
				{ workTypeId: joinery, qty: 1, staffIds: [anna, boris] },
				{ workTypeId: painting, qty: 1, staffIds: [gleb] }
			]
		});

		expect(day.totalMinor).toBe(125_000);
		expect(day.presentCount).toBe(4);
		// Viktor came but did neither work: the day counts for him, the money does not.
		expect(day.shares).toEqual([
			{ staffId: anna, shareMinor: 42_500 },
			{ staffId: boris, shareMinor: 42_500 },
			{ staffId: viktor, shareMinor: 0 },
			{ staffId: gleb, shareMinor: 40_000 }
		]);
		expect(day.entries).toEqual([
			{
				workTypeId: painting,
				title: 'Маляр: любой ящик',
				qty: 1,
				rateMinor: 40_000,
				amountMinor: 40_000,
				staffIds: [gleb]
			},
			{
				workTypeId: joinery,
				title: 'Столяр: любой ящик',
				qty: 1,
				rateMinor: 85_000,
				amountMinor: 85_000,
				staffIds: [anna, boris]
			}
		]);
	});

	it('takes the same work from two crews in one day', () => {
		const day = days().save({
			date: TODAY,
			staffIds: [anna, boris, viktor],
			entries: [
				{ workTypeId: boxes, qty: 2, staffIds: [anna, boris] },
				{ workTypeId: boxes, qty: 1, staffIds: [viktor] }
			]
		});
		expect(day.entries.map((row) => row.staffIds)).toEqual([[anna, boris], [viktor]]);
		expect(day.shares.map((row) => row.shareMinor)).toEqual([20_000, 20_000, 20_000]);
	});

	it('shows an unmarked day with the active staff and nothing earned', () => {
		const day = days().get(TODAY);
		expect(day).toMatchObject({
			date: TODAY,
			weekStartsOn: '2026-10-05',
			periodStatus: 'open',
			canEdit: true,
			canCopyPrevious: false,
			presentCount: 0,
			totalMinor: 0,
			shares: []
		});
		expect(day.staff.map((row) => row.fullName)).toEqual(['Анна', 'Борис', 'Виктор', 'Глеб']);
	});

	it('recounts the shares when the crews of the day change', () => {
		days().save({
			date: TODAY,
			staffIds: [anna, boris, viktor],
			entries: [{ workTypeId: boxes, qty: 10, staffIds: [anna, boris, viktor] }]
		});
		const day = days().save({
			date: TODAY,
			staffIds: [anna, boris],
			entries: [{ workTypeId: boxes, qty: 10, staffIds: [anna, boris] }, solo(sanding, 5, boris)]
		});
		expect(day.totalMinor).toBe(240_000);
		expect(day.shares.map((row) => row.shareMinor)).toEqual([100_000, 140_000]);
		expect(db.select().from(workDays).all()).toHaveLength(1);
	});

	it('refuses works with nobody marked on the day', () => {
		expect(() =>
			days().save({ date: TODAY, staffIds: [], entries: [solo(boxes, 1, anna)] })
		).toThrow(ValidationError);
	});

	it('keeps a day of people without works: they came, the day made nothing', () => {
		const day = days().save({ date: TODAY, staffIds: [anna], entries: [] });
		expect(day).toMatchObject({
			presentCount: 1,
			totalMinor: 0,
			shares: [{ staffId: anna, shareMinor: 0 }]
		});
	});

	it('drops the day when both the people and the works are cleared', () => {
		days().save({ date: TODAY, staffIds: [anna], entries: [solo(boxes, 1, anna)] });
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
		const gone = insertStaff('Дмитрий', false);
		const retired = insertWorkType('Резьба', 50_000, false);
		expect(() => days().save({ date: TODAY, staffIds: [gone], entries: [] })).toThrow(
			ValidationError
		);
		expect(() => days().save({ date: TODAY, staffIds: [9999], entries: [] })).toThrow(
			ValidationError
		);
		expect(() =>
			days().save({ date: TODAY, staffIds: [anna], entries: [solo(retired, 1, anna)] })
		).toThrow(ValidationError);
		expect(() =>
			days().save({ date: TODAY, staffIds: [anna], entries: [solo(9999, 1, anna)] })
		).toThrow(ValidationError);
	});

	it('keeps a worker switched off later on the day they worked', () => {
		const crew = [anna, boris];
		days().save({
			date: TODAY,
			staffIds: crew,
			entries: [{ workTypeId: boxes, qty: 2, staffIds: crew }]
		});
		new PayrollStaffService(actor).setActive(boris, false);

		const day = days().save({
			date: TODAY,
			staffIds: crew,
			entries: [{ workTypeId: boxes, qty: 4, staffIds: crew }]
		});
		expect(day.presentCount).toBe(2);
		expect(day.staff.map((row) => row.fullName)).toContain('Борис');
	});

	it('writes one audit row per save, with the crews and the shares', () => {
		days().save({ date: TODAY, staffIds: [anna], entries: [solo(boxes, 3, anna)] });
		const rows = db.select().from(auditLog).all();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			action: 'payroll.day.save',
			entity: 'work_days',
			after: {
				date: TODAY,
				staffIds: [anna],
				entries: [{ workTypeId: boxes, qty: 3, staffIds: [anna] }],
				totalMinor: 60_000,
				shares: [{ staffId: anna, shareMinor: 60_000 }]
			}
		});
	});
});

describe('the price of a work is frozen in the day', () => {
	it('keeps the old price in an old entry and takes the new one for a new entry', () => {
		days().save({ date: TODAY, staffIds: [anna], entries: [solo(boxes, 10, anna)] });
		const works = new WorkTypeService(actor);
		works.update({ id: boxes, title: 'Сборка ящика', rateMinor: 25_000, roleCode: null });
		works.update({ id: sanding, title: 'Шлифовка', rateMinor: 9_000, roleCode: null });

		expect(days().get(TODAY).totalMinor).toBe(200_000);
		const resaved = days().save({
			date: TODAY,
			staffIds: [anna],
			entries: [solo(boxes, 12, anna), solo(sanding, 1, anna)]
		});
		expect(resaved.entries).toEqual([
			expect.objectContaining({ workTypeId: boxes, rateMinor: 20_000, amountMinor: 240_000 }),
			expect.objectContaining({ workTypeId: sanding, rateMinor: 9_000, amountMinor: 9_000 })
		]);

		const yesterday = days().save({
			date: '2026-10-06',
			staffIds: [anna],
			entries: [solo(boxes, 1, anna)]
		});
		expect(yesterday.totalMinor).toBe(25_000);
	});

	it('keeps the frozen price for a second crew of a work already on the day', () => {
		days().save({ date: TODAY, staffIds: [anna, boris], entries: [solo(boxes, 1, anna)] });
		new WorkTypeService(actor).update({
			id: boxes,
			title: 'Сборка ящика',
			rateMinor: 25_000,
			roleCode: null
		});
		const day = days().save({
			date: TODAY,
			staffIds: [anna, boris],
			entries: [solo(boxes, 1, anna), solo(boxes, 1, boris)]
		});
		expect(day.entries.map((row) => row.rateMinor)).toEqual([20_000, 20_000]);
	});

	it('keeps a work switched off later in the day it was done on', () => {
		days().save({ date: TODAY, staffIds: [anna], entries: [solo(sanding, 2, anna)] });
		new WorkTypeService(actor).setActive(sanding, false);
		const day = days().save({
			date: TODAY,
			staffIds: [anna],
			entries: [solo(sanding, 3, anna)]
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
			entries: [{ workTypeId: boxes, qty: 4, staffIds: [anna, viktor] }]
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
		days().save({ date: '2026-10-05', staffIds: [anna], entries: [solo(boxes, 1, anna)] });
		new PayrollCloseService(actor, calendarAt(NOW)).close(TODAY);

		expect(days().get(TODAY)).toMatchObject({ periodStatus: 'calculated', canEdit: false });
		expect(() => days().save({ date: TODAY, staffIds: [anna], entries: [] })).toThrow(
			ConflictError
		);
		expect(() => days().copyPrevious(TODAY)).toThrow(ConflictError);
		expect(days().get('2026-10-05').totalMinor).toBe(20_000);
	});
});

describe('the input of a day', () => {
	const base = { date: TODAY, staffIds: [1, 2], entries: [] };
	const parse = (value: unknown) => workDaySaveSchema.safeParse(value).success;

	it('rejects a worker named twice and a quantity out of range', () => {
		expect(parse({ ...base, staffIds: [1, 1] })).toBe(false);
		for (const qty of [0, -1, 1.5, 10_001]) {
			expect(parse({ ...base, entries: [{ workTypeId: 1, qty, staffIds: [1] }] })).toBe(false);
		}
		expect(parse({ ...base, date: '2026-02-31' })).toBe(false);
	});

	it('takes one work from two crews but not twice from the same crew', () => {
		const twoCrews = [
			{ workTypeId: 1, qty: 1, staffIds: [1] },
			{ workTypeId: 1, qty: 2, staffIds: [2] }
		];
		expect(parse({ ...base, entries: twoCrews })).toBe(true);
		const sameCrew = [
			{ workTypeId: 1, qty: 1, staffIds: [1, 2] },
			{ workTypeId: 1, qty: 2, staffIds: [2, 1] }
		];
		expect(parse({ ...base, entries: sameCrew })).toBe(false);
	});

	it('rejects a work with no crew and a crew member who did not come', () => {
		expect(parse({ ...base, entries: [{ workTypeId: 1, qty: 1, staffIds: [] }] })).toBe(false);
		expect(parse({ ...base, entries: [{ workTypeId: 1, qty: 1, staffIds: [3] }] })).toBe(false);
		expect(parse({ ...base, entries: [{ workTypeId: 1, qty: 1, staffIds: [1, 1] }] })).toBe(false);
	});

	it('reads the rows of the day form and drops a row without a quantity', () => {
		const parsed = workDayFormSchema.parse({
			date: TODAY,
			'staff.1': 'on',
			'staff.2': 'on',
			'entry.0.work': '5',
			'entry.0.qty': '2',
			'entry.0.staff.1': 'on',
			'entry.0.staff.2': 'on',
			'entry.3.work': '6',
			'entry.3.qty': '',
			'entry.3.staff.1': 'on'
		});
		expect(parsed).toEqual({
			date: TODAY,
			staffIds: [1, 2],
			entries: [{ workTypeId: 5, qty: 2, staffIds: [1, 2] }]
		});
	});
});
