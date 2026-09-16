/**
 * Agency price (tech.md P7): the counterparty sets it for its own client. It is display only,
 * so it never enters a request sum. This module owns the pure part: what a submitted page of the
 * form actually changes.
 */

/** Upper bound shared by the form and the server: one million roubles for a single model. */
export const AGENCY_PRICE_MAX_MINOR = 100_000_000;

export interface AgencyPriceEntry {
	readonly productId: number;
	/** Zero clears the price: the model goes back to showing a dash. */
	readonly priceMinor: number;
}

export interface AgencyPriceUpsert {
	readonly productId: number;
	readonly priceMinor: number;
}

export interface AgencyPricePlan {
	readonly upserts: readonly AgencyPriceUpsert[];
	readonly clears: readonly number[];
}

/**
 * Rows the submitted page changes against the stored state. A value equal to the stored one and a
 * cleared value of a model that has no price both drop out, so a resubmit writes nothing and the
 * journal keeps only real changes.
 */
export function planAgencyPrices(
	entries: readonly AgencyPriceEntry[],
	current: ReadonlyMap<number, number>
): AgencyPricePlan {
	const upserts: AgencyPriceUpsert[] = [];
	const clears: number[] = [];
	const seen = new Set<number>();

	for (const entry of entries) {
		if (seen.has(entry.productId)) continue;
		seen.add(entry.productId);
		const stored = current.get(entry.productId);
		if (entry.priceMinor === 0) {
			if (stored !== undefined) clears.push(entry.productId);
			continue;
		}
		if (stored !== entry.priceMinor) upserts.push(entry);
	}
	return { upserts, clears };
}

/** State after the plan is applied. Used by the tests and by nothing else. */
export function applyAgencyPricePlan(
	current: ReadonlyMap<number, number>,
	plan: AgencyPricePlan
): Map<number, number> {
	const next = new Map(current);
	for (const productId of plan.clears) next.delete(productId);
	for (const upsert of plan.upserts) next.set(upsert.productId, upsert.priceMinor);
	return next;
}
