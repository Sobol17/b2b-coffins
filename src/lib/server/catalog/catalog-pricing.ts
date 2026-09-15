import { PersonalPriceResolver } from '../pricing/personal-price';
import type { VariantPrice } from './dto';
import { VariantRepository } from './variant.repository';
import type { ActorContext } from '$lib/types/actor';

/**
 * Prices of the catalog for one actor. Every method answers undefined for a role without prices,
 * and in that case no money column is read at all (tech.md 8.1).
 */
export class CatalogPricing {
	constructor(
		private readonly ctx: ActorContext,
		private readonly variants: VariantRepository = new VariantRepository(),
		private readonly resolver: PersonalPriceResolver = new PersonalPriceResolver()
	) {}

	/** Personal price per variant, plus the cost price when asked for and the actor is the owner. */
	pricesFor(
		variantIds: readonly number[],
		withCost = false
	): Map<number, VariantPrice> | undefined {
		if (!this.ctx.canSeePrices) return undefined;
		const stored = this.variants.findPrices(
			[...new Set(variantIds)],
			withCost && this.ctx.canSeeCost
		);
		const personal = this.resolver.resolve(
			this.ctx.counterpartyId,
			new Map([...stored].map(([id, row]) => [id, row.basePriceMinor]))
		);
		return new Map(
			[...stored].map(([id, row]) => [
				id,
				{ priceMinor: personal.get(id) ?? row.basePriceMinor, costPriceMinor: row.costPriceMinor }
			])
		);
	}

	/** Lowest personal price per key (a product, a category) over the given variants. */
	minBy<K>(rows: readonly { id: number; key: K }[]): Map<K, number> | undefined {
		const prices = this.pricesFor(rows.map((row) => row.id));
		if (!prices) return undefined;
		const minimum = new Map<K, number>();
		for (const row of rows) {
			const price = prices.get(row.id)?.priceMinor;
			const current = minimum.get(row.key);
			if (price !== undefined && (current === undefined || price < current)) {
				minimum.set(row.key, price);
			}
		}
		return minimum;
	}
}
