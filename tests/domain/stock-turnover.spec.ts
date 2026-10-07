import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { closingQty, turnoverDays } from '../../src/lib/domain/stock/turnover';

const qty = fc.integer({ min: 0, max: 10_000 });
const moves = fc.record({
	opening: fc.integer({ min: -100, max: 10_000 }),
	income: qty,
	outcome: qty,
	shipped: fc.integer({ min: -50, max: 10_000 })
});

describe('stock turnover (C13)', () => {
	it('counts days of stock from the average balance', () => {
		// 10 on the shelf at both ends, 30 shipped in 30 days: the shelf lasts 10 days.
		expect(turnoverDays({ opening: 10, income: 30, outcome: 30, shipped: 30 }, 30)).toBe(10);
	});

	it('gives days only when something was shipped from a positive shelf', () => {
		fc.assert(
			fc.property(moves, fc.integer({ min: 1, max: 366 }), (m, days) => {
				const result = turnoverDays(m, days);
				const average = (m.opening + closingQty(m)) / 2;
				expect(result === null).toBe(m.shipped <= 0 || average <= 0);
				if (result !== null) expect(result).toBeGreaterThanOrEqual(0);
				expect(closingQty(m)).toBe(m.opening + m.income - m.outcome);
			})
		);
	});
});
