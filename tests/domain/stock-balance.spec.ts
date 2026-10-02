import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	balanceOf,
	diffCount,
	hasNegativePosition,
	inventoryDelta,
	isBelowThreshold,
	manualMoveProblem,
	positionBalances,
	reversalQty,
	type MoveQty
} from '../../src/lib/domain/stock/balance';

/** vitest runs with requireAssertions, so a property is asserted through expect, not bare. */
function assertProperty(property: fc.IPropertyWithHooks<unknown[]>): void {
	expect(() => fc.assert(property)).not.toThrow();
}

const move = fc.record({
	optionId: fc.constantFrom<number | null>(null, 11, 12),
	qty: fc.integer({ min: -500, max: 500 })
});
const moves = fc.array(move, { maxLength: 40 });

describe('balance is the sum of moves (C8 DoD)', () => {
	it('does not depend on the order the moves are read in', () => {
		assertProperty(
			fc.property(moves, fc.infiniteStream(fc.nat()), (rows, seeds) => {
				const shuffled = rows
					.map((row) => ({ row, key: seeds.next().value }))
					.sort((a, b) => a.key - b.key)
					.map((entry) => entry.row);
				expect(balanceOf(shuffled)).toBe(balanceOf(rows));
			})
		);
	});

	it('splits into colours that add up to the balance of the item', () => {
		assertProperty(
			fc.property(moves, (rows) => {
				const total = [...positionBalances(rows).values()].reduce((sum, qty) => sum + qty, 0);
				expect(total).toBe(balanceOf(rows));
			})
		);
	});

	it('grows by exactly the quantity of one more move', () => {
		assertProperty(
			fc.property(moves, move, (rows, next) => {
				expect(balanceOf([...rows, next])).toBe(balanceOf(rows) + next.qty);
			})
		);
	});
});

describe('compensation instead of deletion (tech.md 6.3)', () => {
	it('returns every position to where it stood before the reversed move', () => {
		assertProperty(
			fc.property(moves, move, (rows, wrong) => {
				const undo: MoveQty = { optionId: wrong.optionId, qty: reversalQty(wrong.qty) };
				const after = positionBalances([...rows, wrong, undo]);
				const before = positionBalances(rows);
				for (const [optionId, qty] of after) expect(qty).toBe(before.get(optionId) ?? 0);
			})
		);
	});

	it('never writes a negative zero', () => {
		expect(Object.is(reversalQty(0), 0)).toBe(true);
	});
});

describe('inventory', () => {
	it('brings the books to the count with one move per line', () => {
		assertProperty(
			fc.property(moves, fc.integer({ min: 0, max: 1000 }), (rows, actualQty) => {
				const expectedQty = balanceOf(rows);
				const delta = inventoryDelta({ expectedQty, actualQty });
				expect(balanceOf([...rows, { optionId: null, qty: delta }])).toBe(actualQty);
			})
		);
	});

	it('counts only the lines that differ', () => {
		const lines = [
			{ expectedQty: 5, actualQty: 5 },
			{ expectedQty: 5, actualQty: 4 },
			{ expectedQty: -2, actualQty: 0 }
		];
		expect(diffCount(lines)).toBe(2);
	});
});

describe('threshold and the red', () => {
	it('signals under the threshold and stays silent at zero threshold', () => {
		assertProperty(
			fc.property(fc.integer({ min: -50, max: 50 }), fc.nat({ max: 50 }), (balance, min) => {
				expect(isBelowThreshold(balance, min)).toBe(min > 0 && balance < min);
			})
		);
		expect(isBelowThreshold(-5, 0)).toBe(false);
	});

	it('sees a colour in the red behind a positive sum', () => {
		const rows: MoveQty[] = [
			{ optionId: 11, qty: 10 },
			{ optionId: 12, qty: -3 }
		];
		expect(balanceOf(rows)).toBe(7);
		expect(hasNegativePosition(rows)).toBe(true);
		expect(hasNegativePosition([{ optionId: 11, qty: 10 }])).toBe(false);
	});
});

describe('manual move rules (tech.md v1.45)', () => {
	it('refuses a zero move of either type', () => {
		expect(manualMoveProblem('purchase', 0)).toBe('zero');
		expect(manualMoveProblem('adjustment', 0)).toBe('zero');
	});

	it('lets a purchase only bring stock in and an adjustment go either way', () => {
		assertProperty(
			fc.property(fc.integer({ min: 1, max: 1000 }), (qty) => {
				expect(manualMoveProblem('purchase', qty)).toBeNull();
				expect(manualMoveProblem('purchase', -qty)).toBe('purchase_not_positive');
				expect(manualMoveProblem('adjustment', qty)).toBeNull();
				expect(manualMoveProblem('adjustment', -qty)).toBeNull();
			})
		);
	});
});
