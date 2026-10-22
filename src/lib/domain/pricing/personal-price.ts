import { isPriceListActive, type PriceListWindow } from '../request/pricing';

/**
 * Individual prices of one counterparty, filled on its workshop card. They live in a price list
 * that belongs to this counterparty alone (tech.md 5.5), so the resolver needs no new rule. This
 * module owns the pure part: which list takes the prices and what a submitted page changes.
 */

/** Upper bound shared by the form and the server: one million roubles for a single variant. */
export const PERSONAL_PRICE_MAX_MINOR = 100_000_000;

export interface PersonalPriceEntry {
	readonly variantId: number;
	/** Zero clears the price: the variant falls back to the base price list. */
	readonly priceMinor: number;
}

export interface PersonalPricePlan {
	readonly upserts: readonly PersonalPriceEntry[];
	readonly clears: readonly number[];
}

export interface OwnPriceList extends PriceListWindow {
	readonly id: number;
	readonly isBase: boolean;
}

/**
 * Where the prices go. `reuse` writes into the list the counterparty already holds alone. `fork`
 * makes a new list for it: copying the shared list it held keeps every price it paid until now.
 */
export type PersonalListChoice =
	| { readonly kind: 'reuse'; readonly listId: number }
	| { readonly kind: 'fork'; readonly copyFromId: number | null };

/**
 * The list a counterparty pays by is its own only while nobody else holds it. A base list, an
 * expired list and a list shared with another counterparty are never edited from one card: the
 * edit would move the prices of others or would not apply at all.
 * @param holders counterparties assigned to `own`, this one included.
 */
export function choosePersonalList(
	own: OwnPriceList | undefined,
	holders: number,
	at: Date
): PersonalListChoice {
	if (own === undefined || own.isBase || !isPriceListActive(own, at)) {
		return { kind: 'fork', copyFromId: null };
	}
	return holders <= 1 ? { kind: 'reuse', listId: own.id } : { kind: 'fork', copyFromId: own.id };
}

/**
 * Rows the submitted page changes against the stored list. A value equal to the stored one and a
 * cleared value of a variant without a price both drop out, so a resubmit writes nothing and the
 * journal keeps only real changes. A repeated variant counts once, by its first entry.
 */
export function planPersonalPrices(
	entries: readonly PersonalPriceEntry[],
	current: ReadonlyMap<number, number>
): PersonalPricePlan {
	const upserts: PersonalPriceEntry[] = [];
	const clears: number[] = [];
	const seen = new Set<number>();

	for (const entry of entries) {
		if (seen.has(entry.variantId)) continue;
		seen.add(entry.variantId);
		const stored = current.get(entry.variantId);
		if (entry.priceMinor === 0) {
			if (stored !== undefined) clears.push(entry.variantId);
			continue;
		}
		if (stored !== entry.priceMinor) upserts.push(entry);
	}
	return { upserts, clears };
}

/** State after the plan is applied. Used by the tests and by nothing else. */
export function applyPersonalPricePlan(
	current: ReadonlyMap<number, number>,
	plan: PersonalPricePlan
): Map<number, number> {
	const next = new Map(current);
	for (const variantId of plan.clears) next.delete(variantId);
	for (const upsert of plan.upserts) next.set(upsert.variantId, upsert.priceMinor);
	return next;
}
