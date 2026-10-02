/** Pieces of a variant the production queue still lacks; the colour does not change the norm. */
export interface PieceNeed {
	readonly variantId: number;
	readonly neededQty: number;
}

export interface Norm {
	readonly variantId: number;
	readonly componentId: number;
	readonly qtyPerUnitMilli: number;
}

export interface DeficitFigures {
	readonly needMilli: number;
	readonly deficitMilli: number;
}

const UNIT_MILLI = 1000;

/**
 * What the pieces still to be made will use, per component (tech.md v1.46). A variant without a
 * norm asks for nothing; a component nobody needs is absent from the map.
 */
export function componentNeeds(
	needs: readonly PieceNeed[],
	norms: readonly Norm[]
): Map<number, number> {
	const pieces = new Map<number, number>();
	for (const need of needs) {
		pieces.set(need.variantId, (pieces.get(need.variantId) ?? 0) + need.neededQty);
	}
	const result = new Map<number, number>();
	for (const norm of norms) {
		const milli = (pieces.get(norm.variantId) ?? 0) * norm.qtyPerUnitMilli;
		if (milli <= 0) continue;
		result.set(norm.componentId, (result.get(norm.componentId) ?? 0) + milli);
	}
	return result;
}

/** The shelf counts whole units and may be in the red: a negative balance adds to the deficit. */
export function deficitMilli(needMilli: number, balance: number): number {
	return Math.max(0, needMilli - balance * UNIT_MILLI);
}

/** Deficit rows first, the deepest on top; then the largest need. */
export function deficitOrder(a: DeficitFigures, b: DeficitFigures): number {
	return b.deficitMilli - a.deficitMilli || b.needMilli - a.needMilli;
}
