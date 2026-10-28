/** A sale with its cost: the margin is what the workshop keeps (tech.md v1.63). */
export interface MarginInput {
	readonly qty: number;
	readonly totalMinor: number;
	readonly costMinor: number;
}

export interface Margin extends MarginInput {
	readonly marginMinor: number;
	/** Share of the margin in the sum, basis points; null for a sale of nothing. */
	readonly marginBp: number | null;
}

function shareBp(marginMinor: number, totalMinor: number): number | null {
	return totalMinor === 0 ? null : Math.round((marginMinor * 10_000) / totalMinor);
}

export function marginOf(input: MarginInput): Margin {
	const marginMinor = input.totalMinor - input.costMinor;
	return { ...input, marginMinor, marginBp: shareBp(marginMinor, input.totalMinor) };
}

export const ZERO_MARGIN: Margin = marginOf({ qty: 0, totalMinor: 0, costMinor: 0 });

/** Sums two margins; the share is taken again from the sums, never averaged. */
export function addMargins(a: Margin, b: MarginInput): Margin {
	return marginOf({
		qty: a.qty + b.qty,
		totalMinor: a.totalMinor + b.totalMinor,
		costMinor: a.costMinor + b.costMinor
	});
}
