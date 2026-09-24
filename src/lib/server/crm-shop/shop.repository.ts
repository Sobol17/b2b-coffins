import { and, eq, inArray, isNull } from 'drizzle-orm';
import { countExpression } from '../core/list';
import { BaseRepository } from '../core/repository';
import { containsText } from '../core/search';
import type { Tx } from '../db/client';
import {
	counterparties,
	dictItems,
	options,
	productOptions,
	productVariants,
	products,
	requests,
	stockMoves
} from '../db/schema';
import { BOARD_ORDER } from '../crm-request/crm-request-query';
import type { RequestPriority } from '$lib/types/request';

export interface VariantTitleRow {
	readonly id: number;
	readonly productTitle: string;
	readonly sku: string;
	readonly sizeCode: string;
	readonly materialTitle: string;
	readonly stockItemId: number | null;
}

export interface ShopRequestRow {
	readonly id: number;
	readonly number: string;
	readonly priority: RequestPriority;
	readonly isStockRequest: boolean;
	readonly counterpartyName: string | null;
	readonly deliveryAt: Date | null;
}

export interface ProductionMove {
	readonly stockItemId: number;
	readonly optionId: number | null;
	readonly qty: number;
	readonly actorId: number;
	readonly occurredAt: Date;
}

/** What the shop floor reads besides the fill, and the production move it writes (tech.md v1.41). */
export class ShopRepository extends BaseRepository<typeof stockMoves> {
	constructor() {
		super(stockMoves);
	}

	variantTitles(ids: readonly number[]): VariantTitleRow[] {
		if (ids.length === 0) return [];
		return this.db()
			.select({
				id: productVariants.id,
				productTitle: products.title,
				sku: productVariants.sku,
				sizeCode: productVariants.sizeCode,
				materialTitle: dictItems.title,
				stockItemId: productVariants.stockItemId
			})
			.from(productVariants)
			.innerJoin(products, eq(products.id, productVariants.productId))
			.innerJoin(dictItems, eq(dictItems.id, productVariants.materialId))
			.where(inArray(productVariants.id, [...ids]))
			.all();
	}

	optionTitles(ids: readonly number[]): Map<number, string> {
		if (ids.length === 0) return new Map();
		const rows = this.db()
			.select({ id: options.id, title: options.title })
			.from(options)
			.where(inArray(options.id, [...ids]))
			.all();
		return new Map(rows.map((row) => [row.id, row.title]));
	}

	/** Requests in work, in the order the workshop takes them on; the search goes by number. */
	requestsInWork(search: string | undefined, limit: number): ShopRequestRow[] {
		return this.db()
			.select({
				id: requests.id,
				number: requests.number,
				priority: requests.priority,
				isStockRequest: requests.isStockRequest,
				counterpartyName: counterparties.name,
				deliveryAt: requests.deliveryAt
			})
			.from(requests)
			.leftJoin(counterparties, eq(counterparties.id, requests.counterpartyId))
			.where(this.inWork(search))
			.orderBy(...BOARD_ORDER)
			.limit(limit)
			.all();
	}

	countInWork(search: string | undefined): number {
		const [row] = this.db()
			.select({ count: countExpression })
			.from(requests)
			.where(this.inWork(search))
			.all();
		return row?.count ?? 0;
	}

	/** The stock item of a live variant, or undefined for an unknown or deleted one. */
	stockItemOf(variantId: number, tx?: Tx): { stockItemId: number | null } | undefined {
		const [row] = this.db(tx)
			.select({ stockItemId: productVariants.stockItemId })
			.from(productVariants)
			.where(and(eq(productVariants.id, variantId), isNull(productVariants.deletedAt)))
			.all();
		return row;
	}

	/** A colour the variant is made in: the compatibility matrix of C2 says which. */
	isVariantColour(variantId: number, optionId: number, tx?: Tx): boolean {
		return (
			this.db(tx)
				.select({ optionId: productOptions.optionId })
				.from(productOptions)
				.innerJoin(options, eq(options.id, productOptions.optionId))
				.where(
					and(
						eq(productOptions.variantId, variantId),
						eq(productOptions.optionId, optionId),
						eq(options.kind, 'color')
					)
				)
				.all().length > 0
		);
	}

	/** Made for the shelf, not for a request: the fill decides who gets the pieces. */
	insertProduction(move: ProductionMove, tx: Tx): number {
		const [row] = this.db(tx)
			.insert(stockMoves)
			.values({ ...move, type: 'production', requestId: null })
			.returning({ id: stockMoves.id })
			.all();
		if (!row) throw new Error('failed to write a production move');
		return row.id;
	}

	private inWork(search: string | undefined) {
		return and(
			eq(requests.status, 'in_work'),
			search === undefined ? undefined : containsText(requests.number, search)
		);
	}
}
