import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	applyAgencyPricePlan,
	planAgencyPrices,
	type AgencyPriceEntry
} from '../../src/lib/domain/pricing/agency-price';

const entry = fc.record({
	productId: fc.integer({ min: 1, max: 12 }),
	priceMinor: fc.integer({ min: 0, max: 500_000 })
});
const entries = fc.array(entry, { maxLength: 20 });
const current = fc
	.array(fc.tuple(fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 500_000 })), {
		maxLength: 12
	})
	.map((pairs) => new Map<number, number>(pairs));

describe('agency price plan', () => {
	it('writes the submitted page and clears a zero', () => {
		const plan = planAgencyPrices(
			[
				{ productId: 1, priceMinor: 250_000 },
				{ productId: 2, priceMinor: 0 },
				{ productId: 3, priceMinor: 0 }
			],
			new Map([
				[2, 90_000],
				[4, 10_000]
			])
		);
		expect(plan.upserts).toEqual([{ productId: 1, priceMinor: 250_000 }]);
		expect(plan.clears).toEqual([2]);
	});

	it('keeps a model out of the plan when its value did not move', () => {
		const plan = planAgencyPrices([{ productId: 1, priceMinor: 700 }], new Map([[1, 700]]));
		expect(plan).toEqual({ upserts: [], clears: [] });
	});

	it('leaves a model the page did not submit alone', () => {
		fc.assert(
			fc.property(entries, current, (rows, stored) => {
				const plan = planAgencyPrices(rows, stored);
				const submitted = new Set(rows.map((row) => row.productId));
				const touched = [...plan.clears, ...plan.upserts.map((row) => row.productId)];
				expect(touched.every((productId) => submitted.has(productId))).toBe(true);
			})
		);
	});

	it('never puts one model into both buckets', () => {
		fc.assert(
			fc.property(entries, current, (rows, stored) => {
				const plan = planAgencyPrices(rows, stored);
				const cleared = new Set(plan.clears);
				expect(plan.upserts.some((row) => cleared.has(row.productId))).toBe(false);
			})
		);
	});

	it('is idempotent: the second run of the same page changes nothing', () => {
		fc.assert(
			fc.property(entries, current, (rows, stored) => {
				const once = applyAgencyPricePlan(stored, planAgencyPrices(rows, stored));
				expect(planAgencyPrices(rows, once)).toEqual({ upserts: [], clears: [] });
			})
		);
	});

	it('lands on the state the page describes', () => {
		fc.assert(
			fc.property(entries, current, (rows: AgencyPriceEntry[], stored) => {
				const next = applyAgencyPricePlan(stored, planAgencyPrices(rows, stored));
				const firstOf = new Map<number, number>();
				for (const row of rows)
					if (!firstOf.has(row.productId)) firstOf.set(row.productId, row.priceMinor);
				for (const [productId, priceMinor] of firstOf) {
					expect(next.get(productId)).toBe(priceMinor === 0 ? undefined : priceMinor);
				}
			})
		);
	});
});
