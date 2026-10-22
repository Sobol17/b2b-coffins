import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	applyPersonalPricePlan,
	choosePersonalList,
	planPersonalPrices,
	type OwnPriceList
} from '../../src/lib/domain/pricing/personal-price';

const entry = fc.record({
	variantId: fc.integer({ min: 1, max: 12 }),
	priceMinor: fc.integer({ min: 0, max: 500_000 })
});
const entries = fc.array(entry, { maxLength: 20 });
const current = fc
	.array(fc.tuple(fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 500_000 })), {
		maxLength: 12
	})
	.map((pairs) => new Map<number, number>(pairs));

const AT = new Date('2026-10-22T00:00:00Z');
const own = (patch: Partial<OwnPriceList> = {}): OwnPriceList => ({
	id: 7,
	isBase: false,
	validFrom: null,
	validTo: null,
	...patch
});

describe('personal price list choice', () => {
	it('writes into the list the counterparty holds alone', () => {
		expect(choosePersonalList(own(), 1, AT)).toEqual({ kind: 'reuse', listId: 7 });
	});

	it('forks a shared list and keeps its prices', () => {
		expect(choosePersonalList(own(), 2, AT)).toEqual({ kind: 'fork', copyFromId: 7 });
	});

	it('never edits a base list, an expired list or a missing one', () => {
		expect(choosePersonalList(own({ isBase: true }), 1, AT)).toEqual({
			kind: 'fork',
			copyFromId: null
		});
		expect(choosePersonalList(own({ validTo: new Date('2026-10-01T00:00:00Z') }), 1, AT)).toEqual({
			kind: 'fork',
			copyFromId: null
		});
		expect(choosePersonalList(undefined, 0, AT)).toEqual({ kind: 'fork', copyFromId: null });
	});

	it('reuses a list only when it is personal, active and held by one', () => {
		fc.assert(
			fc.property(
				fc.boolean(),
				fc.boolean(),
				fc.integer({ min: 0, max: 5 }),
				(isBase, expired, holders) => {
					const list = own({ isBase, validTo: expired ? new Date('2026-01-01T00:00:00Z') : null });
					const choice = choosePersonalList(list, holders, AT);
					expect(choice.kind === 'reuse').toBe(!isBase && !expired && holders <= 1);
				}
			)
		);
	});
});

describe('personal price plan', () => {
	it('writes the submitted page and clears a zero', () => {
		const plan = planPersonalPrices(
			[
				{ variantId: 1, priceMinor: 1_500_000 },
				{ variantId: 2, priceMinor: 0 },
				{ variantId: 3, priceMinor: 0 }
			],
			new Map([
				[2, 900_000],
				[4, 1_000_000]
			])
		);
		expect(plan.upserts).toEqual([{ variantId: 1, priceMinor: 1_500_000 }]);
		expect(plan.clears).toEqual([2]);
	});

	it('a resubmit of the applied page plans nothing', () => {
		fc.assert(
			fc.property(entries, current, (page, stored) => {
				const next = applyPersonalPricePlan(stored, planPersonalPrices(page, stored));
				expect(planPersonalPrices(page, next)).toEqual({ upserts: [], clears: [] });
			})
		);
	});

	it('leaves variants outside the page as they were', () => {
		fc.assert(
			fc.property(entries, current, (page, stored) => {
				const next = applyPersonalPricePlan(stored, planPersonalPrices(page, stored));
				const touched = new Set(page.map((row) => row.variantId));
				for (const [variantId, price] of stored) {
					if (!touched.has(variantId)) expect(next.get(variantId)).toBe(price);
				}
			})
		);
	});

	it('stores no zero price', () => {
		fc.assert(
			fc.property(entries, current, (page, stored) => {
				const next = applyPersonalPricePlan(stored, planPersonalPrices(page, stored));
				expect([...next.values()].every((price) => price > 0)).toBe(true);
			})
		);
	});
});
