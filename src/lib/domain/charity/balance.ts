/** Accrued but not sent to the fund yet. A reversal row carries a negative amount. */
export function fundRemainderMinor(
	accruedMinor: number,
	transferAmounts: readonly number[]
): number {
	return accruedMinor - transferAmounts.reduce((sum, amount) => sum + amount, 0);
}

/** The workshop cannot send more than it owes the fund (tech.md v1.51). */
export function fitsRemainder(remainderMinor: number, amountMinor: number): boolean {
	return amountMinor > 0 && amountMinor <= remainderMinor;
}

export function isTransferReversible(row: {
	readonly reversalOfId: number | null;
	readonly isReversed: boolean;
}): boolean {
	return row.reversalOfId === null && !row.isReversed;
}
