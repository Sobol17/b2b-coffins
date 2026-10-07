const FULL_BP = 10_000;

export interface StageShare {
	readonly shareOfPreviousBp: number | null;
	readonly shareOfFirstBp: number | null;
}

const share = (count: number, of: number | undefined): number | null =>
	of === undefined || of === 0 ? null : Math.round((count * FULL_BP) / of);

/** Share of each stage in the one before it and in the first one, in basis points. */
export function funnelShares(counts: readonly number[]): StageShare[] {
	return counts.map((count, index) => ({
		shareOfPreviousBp: index === 0 ? null : share(count, counts[index - 1]),
		shareOfFirstBp: share(count, counts[0])
	}));
}
