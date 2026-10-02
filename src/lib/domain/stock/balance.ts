import type { ManualMoveType } from '$lib/types/crm-stock';

/** What the fold reads of a stock move: the signed quantity and the colour of the position. */
export interface MoveQty {
	readonly optionId: number | null;
	readonly qty: number;
}

export interface CountedLine {
	readonly expectedQty: number;
	readonly actualQty: number;
}

/** Balance is never stored (tech.md 5.7): it is the sum of the signed moves. */
export function balanceOf(moves: readonly Pick<MoveQty, 'qty'>[]): number {
	return moves.reduce((sum, move) => sum + move.qty, 0);
}

/** A product keeps a balance per colour; a component has the single colourless position. */
export function positionBalances(moves: readonly MoveQty[]): Map<number | null, number> {
	const balances = new Map<number | null, number>();
	for (const move of moves) {
		balances.set(move.optionId, (balances.get(move.optionId) ?? 0) + move.qty);
	}
	return balances;
}

/** The threshold watches the item as a whole; zero switches the watch off (tech.md v1.45). */
export function isBelowThreshold(balance: number, minThreshold: number): boolean {
	return minThreshold > 0 && balance < minThreshold;
}

/** One colour in the red is enough: the sum over colours could hide it. */
export function hasNegativePosition(moves: readonly MoveQty[]): boolean {
	return [...positionBalances(moves).values()].some((balance) => balance < 0);
}

/** Subtracting from zero: negating a zero would give -0, and -0 is not 0 for `Object.is`. */
export function reversalQty(qty: number): number {
	return 0 - qty;
}

/** The move that brings the books to the count; zero means the line needs no move. */
export function inventoryDelta(line: CountedLine): number {
	return line.actualQty - line.expectedQty;
}

export function diffCount(lines: readonly CountedLine[]): number {
	return lines.filter((line) => inventoryDelta(line) !== 0).length;
}

export const MOVE_PROBLEMS = ['zero', 'purchase_not_positive'] as const;
export type MoveProblem = (typeof MOVE_PROBLEMS)[number];

/** A purchase only brings stock in; an adjustment goes either way but never nowhere. */
export function manualMoveProblem(type: ManualMoveType, qty: number): MoveProblem | null {
	if (qty === 0) return 'zero';
	if (type === 'purchase' && qty < 0) return 'purchase_not_positive';
	return null;
}
