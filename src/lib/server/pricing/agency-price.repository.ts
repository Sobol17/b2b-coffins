import { and, eq, inArray } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { counterpartyProductPrices } from '../db/schema';
import type { AgencyPriceUpsert } from '$lib/domain/pricing/agency-price';

/** Agency prices of one counterparty (P7). Every query carries the counterparty of the actor. */
export class AgencyPriceRepository extends BaseRepository<typeof counterpartyProductPrices> {
	constructor() {
		super(counterpartyProductPrices);
	}

	/** Prices of the given models, or of every model when the list is omitted. */
	pricesOf(counterpartyId: number, productIds?: readonly number[]): Map<number, number> {
		if (productIds !== undefined && productIds.length === 0) return new Map();
		const scope = eq(counterpartyProductPrices.counterpartyId, counterpartyId);
		const rows = this.db()
			.select({
				productId: counterpartyProductPrices.productId,
				priceMinor: counterpartyProductPrices.priceMinor
			})
			.from(counterpartyProductPrices)
			.where(
				productIds === undefined
					? scope
					: and(scope, inArray(counterpartyProductPrices.productId, [...productIds]))
			)
			.all();
		return new Map(rows.map((row) => [row.productId, row.priceMinor]));
	}

	upsert(
		counterpartyId: number,
		actorId: number,
		rows: readonly AgencyPriceUpsert[],
		tx: Tx
	): void {
		for (const row of rows) {
			this.db(tx)
				.insert(counterpartyProductPrices)
				.values({
					counterpartyId,
					productId: row.productId,
					priceMinor: row.priceMinor,
					updatedById: actorId
				})
				.onConflictDoUpdate({
					target: [counterpartyProductPrices.counterpartyId, counterpartyProductPrices.productId],
					set: { priceMinor: row.priceMinor, updatedById: actorId, updatedAt: new Date() }
				})
				.run();
		}
	}

	clear(counterpartyId: number, productIds: readonly number[], tx: Tx): void {
		if (productIds.length === 0) return;
		this.db(tx)
			.delete(counterpartyProductPrices)
			.where(
				and(
					eq(counterpartyProductPrices.counterpartyId, counterpartyId),
					inArray(counterpartyProductPrices.productId, [...productIds])
				)
			)
			.run();
	}
}
