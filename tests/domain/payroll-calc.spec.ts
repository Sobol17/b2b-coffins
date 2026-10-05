import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	addDays,
	dayShareMinor,
	dayTotalMinor,
	payoutMinor,
	weekAccruals,
	weekDatesOf,
	weekStartOf
} from '../../src/lib/domain/payroll/calc';
import { PAYROLL_SHARE_STEP_MINOR } from '../../src/lib/types/crm-payroll';

/** vitest runs with requireAssertions, so a property is asserted through expect, not bare. */
function assertProperty(property: fc.IPropertyWithHooks<unknown[]>): void {
	expect(() => fc.assert(property)).not.toThrow();
}

const entry = fc.record({
	qty: fc.integer({ min: 1, max: 10_000 }),
	rateMinor: fc.integer({ min: 0, max: 1_000_000 })
});
const isoDate = fc.integer({ min: 0, max: 20_000 }).map((offset) => addDays('2020-01-01', offset));

describe('a day is split equally among the people who worked (tech.md v1.48)', () => {
	it('pays the business sample: 10 boxes at 200 roubles for three people', () => {
		const total = dayTotalMinor([{ qty: 10, rateMinor: 20_000 }]);
		expect(total).toBe(200_000);
		// 2000 / 3 = 666,67: the share goes down to a whole rouble.
		expect(dayShareMinor(total, 3)).toBe(66_600);
	});

	it('sums quantity times price over the works of the day', () => {
		assertProperty(
			fc.property(fc.array(entry, { maxLength: 20 }), (entries) => {
				const expected = entries.reduce((sum, row) => sum + row.qty * row.rateMinor, 0);
				expect(dayTotalMinor(entries)).toBe(expected);
			})
		);
	});

	it('keeps a share in whole roubles and never hands out more than the day made', () => {
		assertProperty(
			fc.property(
				fc.integer({ min: 0, max: 1_000_000_000 }),
				fc.integer({ min: 1, max: 50 }),
				(total, headcount) => {
					const share = dayShareMinor(total, headcount);
					expect(share % PAYROLL_SHARE_STEP_MINOR).toBe(0);
					expect(share * headcount).toBeLessThanOrEqual(total);
					// What stays with the workshop is under a rouble a head.
					expect(total - share * headcount).toBeLessThan(PAYROLL_SHARE_STEP_MINOR * headcount);
				}
			)
		);
	});

	it('gives nobody a share when nobody worked', () => {
		expect(dayShareMinor(200_000, 0)).toBe(0);
	});

	it('gives one person the whole day down to a rouble', () => {
		expect(dayShareMinor(123_456, 1)).toBe(123_400);
	});
});

describe('the weekly accrual of a worker', () => {
	const day = fc.record({
		staffIds: fc.uniqueArray(fc.integer({ min: 1, max: 8 }), { maxLength: 8 }),
		shareMinor: fc.integer({ min: 0, max: 500_000 })
	});

	it('is the sum of the shares of the days the worker was on', () => {
		assertProperty(
			fc.property(fc.array(day, { maxLength: 7 }), (days) => {
				const lines = weekAccruals(days);
				for (const line of lines) {
					const own = days.filter((row) => row.staffIds.includes(line.staffId));
					expect(line.daysWorked).toBe(own.length);
					expect(line.accruedMinor).toBe(own.reduce((sum, row) => sum + row.shareMinor, 0));
				}
				const everyone = new Set(days.flatMap((row) => row.staffIds));
				expect(new Set(lines.map((line) => line.staffId))).toEqual(everyone);
			})
		);
	});

	it('adds up to the shares handed out over the week', () => {
		assertProperty(
			fc.property(fc.array(day, { maxLength: 7 }), (days) => {
				const handedOut = days.reduce((sum, row) => sum + row.shareMinor * row.staffIds.length, 0);
				const accrued = weekAccruals(days).reduce((sum, line) => sum + line.accruedMinor, 0);
				expect(accrued).toBe(handedOut);
			})
		);
	});

	it('pays the accrual plus the signed adjustment', () => {
		expect(payoutMinor(66_600, 10_000)).toBe(76_600);
		expect(payoutMinor(66_600, -6_600)).toBe(60_000);
	});
});

describe('the payroll week', () => {
	it('starts on the closing weekday and holds the date', () => {
		assertProperty(
			fc.property(isoDate, fc.integer({ min: 1, max: 7 }), (date, closingDay) => {
				const start = weekStartOf(date, closingDay);
				const isoWeekday = new Date(`${start}T00:00:00Z`).getUTCDay() || 7;
				expect(isoWeekday).toBe(closingDay);
				const dates = weekDatesOf(start);
				expect(dates).toHaveLength(7);
				expect(dates).toContain(date);
			})
		);
	});

	it('runs Monday to Sunday when the week is closed on Mondays', () => {
		// 7 October 2026 is a Wednesday.
		expect(weekStartOf('2026-10-07', 1)).toBe('2026-10-05');
		expect(weekDatesOf('2026-10-05').at(-1)).toBe('2026-10-11');
		expect(weekStartOf('2026-10-05', 1)).toBe('2026-10-05');
		expect(weekStartOf('2026-10-04', 1)).toBe('2026-09-28');
	});

	it('gives every date of a week the same start', () => {
		assertProperty(
			fc.property(isoDate, fc.integer({ min: 1, max: 7 }), (date, closingDay) => {
				const start = weekStartOf(date, closingDay);
				for (const other of weekDatesOf(start)) expect(weekStartOf(other, closingDay)).toBe(start);
			})
		);
	});

	it('steps over a month and a year boundary by the calendar', () => {
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
	});
});
