import { AgencyPriceRepository } from './agency-price.repository';
import type { ActorContext } from '$lib/types/actor';

/**
 * Read side of the agency price (P7). It belongs to the counterparty, so the workshop contour
 * never gets it and a portal request never reads a price of somebody else.
 */
export class AgencyPricing {
	constructor(
		private readonly ctx: ActorContext,
		private readonly repo: AgencyPriceRepository = new AgencyPriceRepository()
	) {}

	/** Prices per model, or undefined outside the portal: the key then stays out of the DTO. */
	forProducts(productIds: readonly number[]): Map<number, number> | undefined {
		if (this.ctx.scope !== 'portal' || this.ctx.counterpartyId === null) return undefined;
		return this.repo.pricesOf(this.ctx.counterpartyId, [...new Set(productIds)]);
	}

	/** Lowest agency price per key (a category and its ancestors), for the "from" figure. */
	minBy<K>(rows: readonly { productId: number; key: K }[]): Map<K, number> | undefined {
		if (this.ctx.scope !== 'portal' || this.ctx.counterpartyId === null) return undefined;
		const prices = this.repo.pricesOf(this.ctx.counterpartyId);
		const minimum = new Map<K, number>();
		for (const row of rows) {
			const price = prices.get(row.productId);
			const current = minimum.get(row.key);
			if (price !== undefined && (current === undefined || price < current)) {
				minimum.set(row.key, price);
			}
		}
		return minimum;
	}
}
