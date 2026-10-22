import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	addDays,
	dayShares,
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

const crewEntry = fc.record({
	amountMinor: fc.integer({ min: 0, max: 100_000_000 }),
	staffIds: fc.uniqueArray(fc.integer({ min: 1, max: 8 }), { minLength: 1, maxLength: 8 })
});
const PRESENT = [1, 2, 3, 4, 5, 6, 7, 8];

function shareOf(shares: readonly { staffId: number; shareMinor: number }[], staffId: number) {
	return shares.find((row) => row.staffId === staffId)?.shareMinor;
}

describe('the day total is quantity times price over the works', () => {
	it('sums quantity times price over the works of the day', () => {
		assertProperty(
			fc.property(fc.array(entry, { maxLength: 20 }), (entries) => {
				const expected = entries.reduce((sum, row) => sum + row.qty * row.rateMinor, 0);
				expect(dayTotalMinor(entries)).toBe(expected);
			})
		);
	});
});

describe('a work is split among the people who did it (tech.md v1.55)', () => {
	it('pays the customer sample: two of three joiners made a box for 850 roubles', () => {
		// Joiners 1, 2, 3 and painters 4, 5 came; joiners 1 and 2 made the box.
		const shares = dayShares([1, 2, 3, 4, 5], [{ amountMinor: 85_000, staffIds: [1, 2] }]);
		expect(shares).toEqual([
			{ staffId: 1, shareMinor: 42_500 },
			{ staffId: 2, shareMinor: 42_500 },
			{ staffId: 3, shareMinor: 0 },
			{ staffId: 4, shareMinor: 0 },
			{ staffId: 5, shareMinor: 0 }
		]);
	});

	it('gives each crew its own work: joiners and painters do not share', () => {
		const shares = dayShares(
			[1, 2, 3],
			[
				{ amountMinor: 85_000, staffIds: [1, 2] },
				{ amountMinor: 40_000, staffIds: [3] }
			]
		);
		expect(shareOf(shares, 1)).toBe(42_500);
		expect(shareOf(shares, 3)).toBe(40_000);
	});

	it('drops the kopecks once per day, not once per work', () => {
		// Two works of 200 roubles for three people: 66,67 + 66,67 = 133,33, so 133 and not 132.
		const crew = [1, 2, 3];
		const shares = dayShares(crew, [
			{ amountMinor: 20_000, staffIds: crew },
			{ amountMinor: 20_000, staffIds: crew }
		]);
		expect(shares.map((row) => row.shareMinor)).toEqual([13_300, 13_300, 13_300]);
	});

	it('pays a crew of everyone present what the v1.48 rule paid', () => {
		assertProperty(
			fc.property(
				fc.array(fc.integer({ min: 0, max: 10_000_000 }), { maxLength: 10 }),
				(amounts) => {
					const total = amounts.reduce((sum, amount) => sum + amount, 0);
					const shares = dayShares(
						PRESENT,
						amounts.map((amountMinor) => ({ amountMinor, staffIds: PRESENT }))
					);
					const old =
						Math.floor(total / PRESENT.length / PAYROLL_SHARE_STEP_MINOR) *
						PAYROLL_SHARE_STEP_MINOR;
					for (const row of shares) expect(row.shareMinor).toBe(old);
				}
			)
		);
	});

	it('keeps shares in whole roubles and never hands out more than the day made', () => {
		assertProperty(
			fc.property(fc.array(crewEntry, { maxLength: 12 }), (entries) => {
				const shares = dayShares(PRESENT, entries);
				const total = entries.reduce((sum, row) => sum + row.amountMinor, 0);
				const handedOut = shares.reduce((sum, row) => sum + row.shareMinor, 0);
				for (const row of shares) expect(row.shareMinor % PAYROLL_SHARE_STEP_MINOR).toBe(0);
				expect(handedOut).toBeLessThanOrEqual(total);
				// What stays with the workshop is under a rouble a head.
				expect(total - handedOut).toBeLessThan(PAYROLL_SHARE_STEP_MINOR * PRESENT.length);
			})
		);
	});

	it('lists every present worker once and pays nothing to one in no crew', () => {
		assertProperty(
			fc.property(fc.array(crewEntry, { maxLength: 12 }), (entries) => {
				const shares = dayShares(PRESENT, entries);
				expect(shares.map((row) => row.staffId)).toEqual(PRESENT);
				const busy = new Set(entries.flatMap((row) => row.staffIds));
				for (const row of shares) if (!busy.has(row.staffId)) expect(row.shareMinor).toBe(0);
			})
		);
	});

	it('gives one person the whole day down to a rouble', () => {
		expect(dayShares([7], [{ amountMinor: 123_456, staffIds: [7] }])).toEqual([
			{ staffId: 7, shareMinor: 123_400 }
		]);
	});
});

describe('the weekly accrual of a worker', () => {
	const day = fc.uniqueArray(fc.integer({ min: 1, max: 8 }), { maxLength: 8 }).chain((staffIds) =>
		fc.record({
			staffIds: fc.constant(staffIds),
			shares: fc.tuple(
				...staffIds.map((staffId) =>
					fc.record({
						staffId: fc.constant(staffId),
						shareMinor: fc.integer({ min: 0, max: 500_000 })
					})
				)
			)
		})
	);

	it('counts the days the worker came and sums their own shares', () => {
		assertProperty(
			fc.property(fc.array(day, { maxLength: 7 }), (days) => {
				const lines = weekAccruals(days);
				for (const line of lines) {
					const own = days.filter((row) => row.staffIds.includes(line.staffId));
					expect(line.daysWorked).toBe(own.length);
					expect(line.accruedMinor).toBe(
						own.reduce((sum, row) => sum + (shareOf(row.shares, line.staffId) ?? 0), 0)
					);
				}
				const everyone = new Set(days.flatMap((row) => row.staffIds));
				expect(new Set(lines.map((line) => line.staffId))).toEqual(everyone);
			})
		);
	});

	it('adds up to the shares handed out over the week', () => {
		assertProperty(
			fc.property(fc.array(day, { maxLength: 7 }), (days) => {
				const handedOut = days
					.flatMap((row) => row.shares)
					.reduce((sum, row) => sum + row.shareMinor, 0);
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
