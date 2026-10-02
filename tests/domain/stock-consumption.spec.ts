import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { carryOf, consume, type ConsumptionMove } from '../../src/lib/domain/stock/consumption';

/** vitest runs with requireAssertions, so a property is asserted through expect, not bare. */
function assertProperty(property: fc.IPropertyWithHooks<unknown[]>): void {
	expect(() => fc.assert(property)).not.toThrow();
}

const mark = fc.record({
	pieces: fc.integer({ min: 1, max: 999 }),
	normMilli: fc.integer({ min: 1, max: 100_000 })
});
const marks = fc.array(mark, { minLength: 1, maxLength: 30 });

/** Replays the marks the way the shop does: the carry is read back from the moves written so far. */
function replay(rows: readonly { pieces: number; normMilli: number }[]): ConsumptionMove[] {
	const moves: ConsumptionMove[] = [];
	for (const row of rows) {
		const { qty, consumedMilli } = consume(carryOf(moves), row.pieces, row.normMilli);
		moves.push({ qty, consumedMilli });
	}
	return moves;
}

describe('consumption by the norm (C9 DoD)', () => {
	it('writes off 0,35 l a piece as one litre on the third piece', () => {
		const moves = replay([
			{ pieces: 1, normMilli: 350 },
			{ pieces: 1, normMilli: 350 },
			{ pieces: 1, normMilli: 350 }
		]);
		expect(moves.map((move) => move.qty)).toEqual([0, 0, -1]);
		expect(carryOf(moves)).toBe(50);
	});

	it('keeps the shelf short by less than one unit over any run of marks', () => {
		assertProperty(
			fc.property(marks, (rows) => {
				const moves = replay(rows);
				const used = rows.reduce((sum, row) => sum + row.pieces * row.normMilli, 0);
				const writtenOff = moves.reduce((sum, move) => sum - move.qty, 0);
				expect(writtenOff).toBe(Math.floor(used / 1000));
				expect(carryOf(moves)).toBe(used % 1000);
			})
		);
	});

	it('never brings stock in and never writes minus zero', () => {
		assertProperty(
			fc.property(fc.integer({ min: 0, max: 999 }), mark, (carry, row) => {
				const { qty, carryMilli } = consume(carry, row.pieces, row.normMilli);
				expect(qty).toBeLessThanOrEqual(0);
				expect(Object.is(qty, -0)).toBe(false);
				expect(carryMilli).toBeGreaterThanOrEqual(0);
				expect(carryMilli).toBeLessThan(1000);
			})
		);
	});

	it('does not depend on how the pieces are split between marks', () => {
		assertProperty(
			fc.property(
				fc.integer({ min: 1, max: 400 }),
				fc.integer({ min: 1, max: 400 }),
				fc.integer({ min: 1, max: 100_000 }),
				(first, second, normMilli) => {
					const apart = replay([
						{ pieces: first, normMilli },
						{ pieces: second, normMilli }
					]);
					const together = replay([{ pieces: first + second, normMilli }]);
					const total = (moves: ConsumptionMove[]) => moves.reduce((sum, m) => sum + m.qty, 0);
					expect(total(apart)).toBe(total(together));
				}
			)
		);
	});

	it('reads no carry from moves without an exact figure', () => {
		expect(carryOf([])).toBe(0);
		expect(carryOf([{ qty: 0, consumedMilli: null }])).toBe(0);
	});
});
