import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	FILL_TIERS,
	allocateStock,
	fillOrder,
	fillTier,
	isCovered,
	positionKey,
	productionNeeds,
	type DemandLine
} from '../../src/lib/domain/stock/allocation';

/** vitest runs with requireAssertions, so a property is asserted through expect, not bare. */
function assertProperty(property: fc.IPropertyWithHooks<unknown[]>): void {
	expect(() => fc.assert(property)).not.toThrow();
}

const DAY_MS = 86_400_000;
const base = new Date('2026-09-24T09:00:00Z').getTime();

// Two stock items in two colours plus a variant without a stock item: collisions are the point.
const line = fc.record({
	requestId: fc.integer({ min: 1, max: 6 }),
	variantId: fc.integer({ min: 1, max: 3 }),
	optionId: fc.constantFrom<number | null>(null, 11),
	qty: fc.integer({ min: 1, max: 8 }),
	tier: fc.constantFrom(...FILL_TIERS),
	isUrgent: fc.boolean(),
	deliveryDay: fc.option(fc.integer({ min: 0, max: 5 }), { nil: null })
});

const demand = fc.array(line, { maxLength: 25 }).map((rows) =>
	rows.map((row, index): DemandLine => ({
		itemId: index + 1,
		requestId: row.requestId,
		variantId: row.variantId,
		optionId: row.optionId,
		stockItemId: row.variantId === 3 ? null : 100 + row.variantId,
		qty: row.qty,
		tier: row.tier,
		isUrgent: row.isUrgent,
		deliveryAt: row.deliveryDay === null ? null : new Date(base + row.deliveryDay * DAY_MS)
	}))
);

const balances = fc
	.record({ a: fc.integer({ min: -5, max: 30 }), b: fc.integer({ min: -5, max: 30 }) })
	.map(
		({ a, b }) =>
			new Map([
				[positionKey(101, null), a],
				[positionKey(101, 11), b],
				[positionKey(102, 11), a + b]
			])
	);

function keyOf(row: DemandLine): string | null {
	return row.stockItemId === null ? null : positionKey(row.stockItemId, row.optionId);
}

function sum(values: readonly number[]): number {
	return values.reduce((total, value) => total + value, 0);
}

function lineOf(overrides: Partial<DemandLine> & Pick<DemandLine, 'itemId'>): DemandLine {
	return {
		requestId: overrides.itemId,
		variantId: 1,
		optionId: 11,
		stockItemId: 101,
		qty: 1,
		tier: 'work',
		isUrgent: false,
		deliveryAt: null,
		...overrides
	};
}

describe('fill of requests from stock (tech.md v1.41)', () => {
	it('gives every line between nothing and its quantity', () => {
		assertProperty(
			fc.property(demand, balances, (lines, stock) => {
				const filled = allocateStock(lines, stock);
				return lines.every((row) => {
					const got = filled.get(row.itemId);
					return got !== undefined && got >= 0 && got <= row.qty;
				});
			})
		);
	});

	it('hands out exactly the positive balance of a position or the whole demand, the smaller', () => {
		assertProperty(
			fc.property(demand, balances, (lines, stock) => {
				const filled = allocateStock(lines, stock);
				return [...stock.entries()].every(([key, balance]) => {
					const own = lines.filter((row) => keyOf(row) === key);
					const given = sum(own.map((row) => filled.get(row.itemId) ?? 0));
					return given === Math.min(Math.max(0, balance), sum(own.map((row) => row.qty)));
				});
			})
		);
	});

	it('never gives a later line anything while an earlier one on the position lacks pieces', () => {
		assertProperty(
			fc.property(demand, balances, (lines, stock) => {
				const filled = allocateStock(lines, stock);
				const ordered = [...lines].sort(fillOrder);
				return ordered.every((earlier, index) => {
					if ((filled.get(earlier.itemId) ?? 0) >= earlier.qty) return true;
					return ordered
						.slice(index + 1)
						.filter((later) => keyOf(later) !== null && keyOf(later) === keyOf(earlier))
						.every((later) => filled.get(later.itemId) === 0);
				});
			})
		);
	});

	it('does not depend on the order the lines were read in', () => {
		assertProperty(
			fc.property(demand, balances, (lines, stock) => {
				const straight = allocateStock(lines, stock);
				const reversed = allocateStock([...lines].reverse(), stock);
				return lines.every((row) => straight.get(row.itemId) === reversed.get(row.itemId));
			})
		);
	});

	it('never fills a line whose variant has no stock item', () => {
		assertProperty(
			fc.property(demand, balances, (lines, stock) => {
				const filled = allocateStock(lines, stock);
				return lines
					.filter((row) => row.stockItemId === null)
					.every((row) => filled.get(row.itemId) === 0);
			})
		);
	});

	it('serves the urgent request before the one due earlier, and a near deadline before a far one', () => {
		const stock = new Map([[positionKey(101, 11), 3]]);
		const lines = [
			lineOf({ itemId: 1, qty: 2, deliveryAt: new Date(base + 5 * DAY_MS) }),
			lineOf({ itemId: 2, qty: 2, deliveryAt: new Date(base + DAY_MS) }),
			lineOf({ itemId: 3, qty: 2, deliveryAt: null, isUrgent: true })
		];

		const filled = allocateStock(lines, stock);

		expect([filled.get(3), filled.get(2), filled.get(1)]).toEqual([2, 1, 0]);
	});

	it('keeps the pieces of an assembled request on the shelf and serves a stock request last', () => {
		const stock = new Map([[positionKey(101, 11), 3]]);
		const lines = [
			lineOf({ itemId: 1, qty: 2, tier: 'stock', isUrgent: true }),
			lineOf({ itemId: 2, qty: 2, tier: 'work', isUrgent: true }),
			lineOf({ itemId: 3, qty: 2, tier: 'held' })
		];

		const filled = allocateStock(lines, stock);

		expect([filled.get(3), filled.get(2), filled.get(1)]).toEqual([2, 1, 0]);
	});

	it('keeps two colours of one variant apart', () => {
		const stock = new Map([
			[positionKey(101, 11), 2],
			[positionKey(101, 12), 0]
		]);
		const lines = [lineOf({ itemId: 1, qty: 2, optionId: 12 }), lineOf({ itemId: 2, qty: 2 })];

		const filled = allocateStock(lines, stock);

		expect([filled.get(1), filled.get(2)]).toEqual([0, 2]);
	});

	it('covers a request only when it has lines and every one is full', () => {
		const filled = new Map([
			[1, 2],
			[2, 1]
		]);
		expect(isCovered([{ itemId: 1, qty: 2 }], filled)).toBe(true);
		expect(
			isCovered(
				[
					{ itemId: 1, qty: 2 },
					{ itemId: 2, qty: 2 }
				],
				filled
			)
		).toBe(false);
		expect(isCovered([], filled)).toBe(false);
	});

	it('lets only a counterparty request hold stock once assembled', () => {
		expect([
			fillTier('ready', false),
			fillTier('ready', true),
			fillTier('in_work', false),
			fillTier('in_work', true),
			fillTier('new', false),
			fillTier('delivered', false)
		]).toEqual(['held', null, 'work', 'stock', null, null]);
	});
});

describe('production queue of the shop (tech.md v1.41)', () => {
	it('asks for exactly the pieces the requests in work lack', () => {
		assertProperty(
			fc.property(demand, balances, (lines, stock) => {
				const filled = allocateStock(lines, stock);
				const lacking = sum(
					lines
						.filter((row) => row.tier !== 'held')
						.map((row) => row.qty - (filled.get(row.itemId) ?? 0))
				);
				return sum(productionNeeds(lines, filled).map((need) => need.neededQty)) === lacking;
			})
		);
	});

	it('lists a position once and never with nothing to make', () => {
		assertProperty(
			fc.property(demand, balances, (lines, stock) => {
				const needs = productionNeeds(lines, allocateStock(lines, stock));
				const keys = needs.map((need) => `${need.variantId}:${need.optionId}`);
				return new Set(keys).size === keys.length && needs.every((need) => need.neededQty > 0);
			})
		);
	});

	it('puts an urgent position first and a near deadline before a far one', () => {
		const lines = [
			lineOf({ itemId: 1, variantId: 1, deliveryAt: new Date(base + 3 * DAY_MS) }),
			lineOf({ itemId: 2, variantId: 2, deliveryAt: new Date(base + DAY_MS) }),
			lineOf({ itemId: 3, variantId: 3, isUrgent: true }),
			lineOf({ itemId: 4, variantId: 2, requestId: 9, deliveryAt: new Date(base + 2 * DAY_MS) })
		];

		const needs = productionNeeds(lines, new Map());

		expect(needs.map((need) => [need.variantId, need.neededQty, need.requestCount])).toEqual([
			[3, 1, 1],
			[2, 2, 2],
			[1, 1, 1]
		]);
		expect(needs[1]?.nearestDeliveryAt).toEqual(new Date(base + DAY_MS));
	});
});
