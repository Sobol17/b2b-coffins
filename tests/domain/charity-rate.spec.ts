import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	charityAmountMinor,
	countsTowardFund,
	formatCharityScope,
	freezeCharity,
	parseCharityScope,
	scopesForDelivery,
	tallyCharity,
	type CharityScope,
	type DeliveredCharityRow
} from '../../src/lib/domain/charity/rate';
import { REQUEST_STATUSES } from '../../src/lib/types/request';

const ZONE = 'Europe/Moscow';
const total = fc.integer({ min: 0, max: 100_000_000 });
const rate = fc.integer({ min: 0, max: 10_000 });

// A stock request has no counterparty and every other request has one (tech.md 5.6).
const row: fc.Arbitrary<DeliveredCharityRow> = fc
	.record({
		status: fc.constantFrom(...REQUEST_STATUSES),
		isStockRequest: fc.boolean(),
		counterpartyId: fc.integer({ min: 1, max: 4 }),
		charityAmountMinor: fc.option(fc.integer({ min: 0, max: 1_000_000 }), { nil: null }),
		deliveredAt: fc.option(
			fc.date({
				min: new Date('2024-06-01T00:00:00Z'),
				max: new Date('2027-06-01T00:00:00Z'),
				noInvalidDate: true
			}),
			{ nil: null }
		)
	})
	.map((r) => ({ ...r, counterpartyId: r.isStockRequest ? null : r.counterpartyId }));

describe('charity amount', () => {
	it('takes the rate in basis points of the request total', () => {
		expect(charityAmountMinor(1_234_500, 100)).toBe(12_345);
		expect(charityAmountMinor(1_000_000, 250)).toBe(25_000);
	});

	it('rounds half a kopeck up', () => {
		expect(charityAmountMinor(50, 100)).toBe(1);
		expect(charityAmountMinor(49, 100)).toBe(0);
	});

	it('never exceeds the total and never goes below zero', () => {
		fc.assert(
			fc.property(total, rate, (sum, bp) => {
				const amount = charityAmountMinor(sum, bp);
				expect(Number.isInteger(amount)).toBe(true);
				expect(amount).toBeGreaterThanOrEqual(0);
				expect(amount).toBeLessThanOrEqual(sum);
			})
		);
	});

	it('refuses a rate outside 0 to 10000 basis points', () => {
		expect(() => charityAmountMinor(100, -1)).toThrow(RangeError);
		expect(() => charityAmountMinor(100, 10_001)).toThrow(RangeError);
		expect(() => charityAmountMinor(100, 1.5)).toThrow(RangeError);
	});
});

describe('charity freeze', () => {
	it('fixes the rate and the amount on the first delivery', () => {
		expect(
			freezeCharity({ totalMinor: 200_000, isStockRequest: false, charityAmountMinor: null }, 150)
		).toEqual({ charityRateBp: 150, charityAmountMinor: 3_000 });
	});

	it('gives a stock request nothing (invariant 6)', () => {
		expect(
			freezeCharity({ totalMinor: 200_000, isStockRequest: true, charityAmountMinor: null }, 150)
		).toBeNull();
	});

	it('never moves an amount that is already fixed (invariant 3)', () => {
		fc.assert(
			fc.property(total, rate, fc.integer({ min: 0, max: 1_000_000 }), (sum, bp, frozen) => {
				expect(
					freezeCharity({ totalMinor: sum, isStockRequest: false, charityAmountMinor: frozen }, bp)
				).toBeNull();
			})
		);
	});
});

describe('charity tally', () => {
	const base: DeliveredCharityRow = {
		status: 'paid',
		isStockRequest: false,
		counterpartyId: 1,
		charityAmountMinor: 500,
		deliveredAt: new Date('2026-03-01T10:00:00Z')
	};

	it('leaves out cancelled, rejected, stock and unfrozen requests', () => {
		const rows: DeliveredCharityRow[] = [
			base,
			{ ...base, status: 'cancelled' },
			{ ...base, status: 'rejected' },
			{ ...base, isStockRequest: true, counterpartyId: null },
			{ ...base, charityAmountMinor: null }
		];
		expect(tallyCharity(rows, { kind: 'all' }, ZONE)).toEqual({
			amountMinor: 500,
			requestCount: 1
		});
	});

	it('dates the year by the delivery in the organisation zone', () => {
		// 31 Dec 21:30 UTC is already 1 Jan in Moscow.
		const newYearEve = { ...base, deliveredAt: new Date('2025-12-31T21:30:00Z') };
		expect(tallyCharity([newYearEve], { kind: 'year', year: 2026 }, ZONE).requestCount).toBe(1);
		expect(tallyCharity([newYearEve], { kind: 'year', year: 2025 }, ZONE).requestCount).toBe(0);
	});

	it('counts only the own counterparty for a personal scope', () => {
		const rows = [base, { ...base, counterpartyId: 2, charityAmountMinor: 700 }];
		expect(tallyCharity(rows, { kind: 'counterparty', counterpartyId: 2 }, ZONE)).toEqual({
			amountMinor: 700,
			requestCount: 1
		});
	});

	it('splits the whole fund into counterparties without losing a kopeck', () => {
		fc.assert(
			fc.property(fc.array(row, { maxLength: 40 }), (rows) => {
				const all = tallyCharity(rows, { kind: 'all' }, ZONE);
				const parts = [1, 2, 3, 4].map((id) =>
					tallyCharity(rows, { kind: 'counterparty', counterpartyId: id }, ZONE)
				);
				expect(parts.reduce((sum, part) => sum + part.amountMinor, 0)).toBe(all.amountMinor);
				expect(parts.reduce((sum, part) => sum + part.requestCount, 0)).toBe(all.requestCount);
			})
		);
	});

	it('never counts a row the fund rule refuses', () => {
		fc.assert(
			fc.property(fc.array(row, { maxLength: 40 }), (rows) => {
				const counted = rows.filter(countsTowardFund);
				expect(tallyCharity(rows, { kind: 'all' }, ZONE).requestCount).toBe(counted.length);
				expect(counted.every((r) => !r.isStockRequest && r.status !== 'cancelled')).toBe(true);
			})
		);
	});
});

describe('charity scope', () => {
	it('reads the three scope shapes of charity_totals', () => {
		expect(parseCharityScope('all')).toEqual({ kind: 'all' });
		expect(parseCharityScope('year:2026')).toEqual({ kind: 'year', year: 2026 });
		expect(parseCharityScope('cp:12')).toEqual({ kind: 'counterparty', counterpartyId: 12 });
	});

	it('refuses anything else', () => {
		for (const text of ['', 'year:26', 'cp:0', 'cp:-1', 'cp:1x', 'ALL', 'year:2026:1']) {
			expect(parseCharityScope(text)).toBeNull();
		}
	});

	it('writes back exactly what it reads', () => {
		const scope: fc.Arbitrary<CharityScope> = fc.oneof(
			fc.constant({ kind: 'all' } as const),
			fc.integer({ min: 2000, max: 2999 }).map((year) => ({ kind: 'year', year }) as const),
			fc
				.integer({ min: 1, max: 1_000_000 })
				.map((counterpartyId) => ({ kind: 'counterparty', counterpartyId }) as const)
		);
		fc.assert(
			fc.property(scope, (value) => {
				expect(parseCharityScope(formatCharityScope(value))).toEqual(value);
			})
		);
	});

	it('names the fund, the year and the counterparty of a delivery', () => {
		expect(scopesForDelivery(new Date('2025-12-31T21:30:00Z'), 7, ZONE)).toEqual([
			'all',
			'year:2026',
			'cp:7'
		]);
	});
});
