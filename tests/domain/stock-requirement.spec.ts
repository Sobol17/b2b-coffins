import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	componentNeeds,
	deficitMilli,
	deficitOrder,
	type Norm,
	type PieceNeed
} from '../../src/lib/domain/stock/requirement';

function assertProperty(property: fc.IPropertyWithHooks<unknown[]>): void {
	expect(() => fc.assert(property)).not.toThrow();
}

const need = fc.record({
	variantId: fc.integer({ min: 1, max: 5 }),
	neededQty: fc.integer({ min: 1, max: 200 })
});
const norms = fc.uniqueArray(
	fc.record({
		variantId: fc.integer({ min: 1, max: 5 }),
		componentId: fc.integer({ min: 1, max: 4 }),
		qtyPerUnitMilli: fc.integer({ min: 1, max: 50_000 })
	}),
	{ selector: (norm) => `${norm.variantId}:${norm.componentId}`, maxLength: 20 }
);

function total(map: Map<number, number>): number {
	return [...map.values()].reduce((sum, value) => sum + value, 0);
}

describe('component need of the production queue (C9)', () => {
	it('multiplies the missing pieces by the norm', () => {
		const needs: PieceNeed[] = [
			{ variantId: 1, neededQty: 3 },
			{ variantId: 1, neededQty: 2 },
			{ variantId: 2, neededQty: 4 }
		];
		const table: Norm[] = [
			{ variantId: 1, componentId: 10, qtyPerUnitMilli: 2400 },
			{ variantId: 2, componentId: 10, qtyPerUnitMilli: 1000 },
			{ variantId: 2, componentId: 11, qtyPerUnitMilli: 350 }
		];
		expect([...componentNeeds(needs, table)]).toEqual([
			[10, 16_000],
			[11, 1400]
		]);
	});

	it('asks for nothing when a variant has no norm', () => {
		expect(componentNeeds([{ variantId: 7, neededQty: 5 }], []).size).toBe(0);
	});

	it('adds up over the queue: two halves need what the whole needs', () => {
		assertProperty(
			fc.property(
				fc.array(need, { maxLength: 15 }),
				fc.array(need, { maxLength: 15 }),
				norms,
				(a, b, table) => {
					const whole = componentNeeds([...a, ...b], table);
					expect(total(whole)).toBe(
						total(componentNeeds(a, table)) + total(componentNeeds(b, table))
					);
					for (const value of whole.values()) expect(value).toBeGreaterThan(0);
				}
			)
		);
	});
});

describe('deficit of a component (C9 DoD)', () => {
	it('is the need the shelf does not cover', () => {
		expect(deficitMilli(16_000, 10)).toBe(6000);
		expect(deficitMilli(16_000, 16)).toBe(0);
		expect(deficitMilli(16_000, 40)).toBe(0);
	});

	it('grows by a shelf in the red', () => {
		expect(deficitMilli(1000, -2)).toBe(3000);
	});

	it('is never negative and never above the need plus the debt of the shelf', () => {
		assertProperty(
			fc.property(
				fc.integer({ min: 0, max: 10_000_000 }),
				fc.integer({ min: -500, max: 500 }),
				(needMilli, balance) => {
					const deficit = deficitMilli(needMilli, balance);
					expect(deficit).toBeGreaterThanOrEqual(0);
					expect(deficit).toBeLessThanOrEqual(needMilli + Math.max(0, -balance) * 1000);
				}
			)
		);
	});

	it('lists deficit rows first, the deepest on top', () => {
		const rows = [
			{ needMilli: 9000, deficitMilli: 0 },
			{ needMilli: 2000, deficitMilli: 500 },
			{ needMilli: 4000, deficitMilli: 3000 },
			{ needMilli: 1000, deficitMilli: 0 }
		];
		expect([...rows].sort(deficitOrder).map((row) => row.deficitMilli)).toEqual([3000, 500, 0, 0]);
		expect([...rows].sort(deficitOrder).map((row) => row.needMilli)).toEqual([
			4000, 2000, 9000, 1000
		]);
	});
});
