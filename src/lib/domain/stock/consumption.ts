/** What the carry reads of a consumption move: the signed whole units and the exact figure. */
export interface ConsumptionMove {
	readonly qty: number;
	readonly consumedMilli: number | null;
}

export interface Consumption {
	/** Exact use of the mark: norm × pieces. */
	readonly consumedMilli: number;
	/** Signed quantity of the stock move, zero or below. */
	readonly qty: number;
	/** The fraction left for the next mark, always under one unit. */
	readonly carryMilli: number;
}

const UNIT_MILLI = 1000;

/**
 * The fraction of a unit already used but not yet written off (tech.md v1.46): everything the
 * consumption moves of a component used, minus the whole units they took off the shelf.
 */
export function carryOf(moves: readonly ConsumptionMove[]): number {
	return moves.reduce(
		(carry, move) => carry + (move.consumedMilli ?? 0) + move.qty * UNIT_MILLI,
		0
	);
}

/**
 * One production mark against one norm. The shelf counts whole units while a norm is a fraction,
 * so the mark writes off the whole units reached with the carry and hands the rest on: over any
 * run of marks the shelf is short by less than one unit, never by a rounding per mark.
 */
export function consume(carryMilli: number, pieces: number, normMilli: number): Consumption {
	const consumedMilli = pieces * normMilli;
	const due = carryMilli + consumedMilli;
	const units = Math.floor(due / UNIT_MILLI);
	// Subtracting from zero: negating a zero would give -0, and -0 is not 0 for `Object.is`.
	return { consumedMilli, qty: 0 - units, carryMilli: due - units * UNIT_MILLI };
}
