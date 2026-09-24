import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	requestTotalsWithRules,
	type DiscountLine,
	type DiscountRule
} from '../../src/lib/domain/request/discount-rules';

describe('C2 discount rules', () => {
	it('takes the larger rule for each category and groups equal rates before rounding', () => {
		const lines: DiscountLine[] = [
			{ totalMinor: 101, categoryIds: [2, 1] },
			{ totalMinor: 101, categoryIds: [3, 1] },
			{ totalMinor: 100, categoryIds: [4] }
		];
		const rules: DiscountRule[] = [
			{ percent: 10, categoryId: 1 },
			{ percent: 20, categoryId: 2 }
		];
		expect(requestTotalsWithRules(lines, 5, rules)).toEqual({
			itemsTotalMinor: 302,
			discountMinor: 35,
			totalMinor: 267
		});
	});

	it('preserves the old once-per-request contract discount without rules', () => {
		fc.assert(
			fc.property(
				fc.array(fc.integer({ min: 0, max: 100_000 }), { minLength: 1, maxLength: 20 }),
				fc.integer({ min: 0, max: 100 }),
				(amounts, percent) => {
					const total = amounts.reduce((sum, amount) => sum + amount, 0);
					const actual = requestTotalsWithRules(
						amounts.map((amount) => ({ totalMinor: amount, categoryIds: [] })),
						percent,
						[]
					);
					expect(actual.discountMinor).toBe(Math.floor((total * percent + 50) / 100));
				}
			)
		);
	});
});
