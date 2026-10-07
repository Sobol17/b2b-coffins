export interface PositionMoves {
	readonly opening: number;
	readonly income: number;
	readonly outcome: number;
	/** Shipments net of their reversals; below zero when a period only holds the reversal. */
	readonly shipped: number;
}

export function closingQty(moves: PositionMoves): number {
	return moves.opening + moves.income - moves.outcome;
}

/** Days the average shelf lasts at the shipping pace of the period, or null when it says nothing. */
export function turnoverDays(moves: PositionMoves, days: number): number | null {
	const average = (moves.opening + closingQty(moves)) / 2;
	if (moves.shipped <= 0 || average <= 0) return null;
	return Math.round((average * days) / moves.shipped);
}
