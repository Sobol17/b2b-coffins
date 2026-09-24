import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import {
	options,
	productVariants,
	requestItemOptions,
	requestItems,
	requests,
	stockMoves
} from '../db/schema';
import { positionKey } from '$lib/domain/stock/allocation';
import type { RequestPriority, RequestStatus } from '$lib/types/request';

export interface DemandRow {
	readonly itemId: number;
	readonly requestId: number;
	readonly variantId: number;
	readonly stockItemId: number | null;
	readonly qty: number;
	readonly status: RequestStatus;
	readonly isStockRequest: boolean;
	readonly priority: RequestPriority;
	readonly deliveryAt: Date | null;
}

/** What the fill of requests from stock reads (tech.md v1.41). Deciding the fill is the domain's. */
export class StockFillRepository extends BaseRepository<typeof stockMoves> {
	constructor() {
		super(stockMoves);
	}

	/** Lines of every request that holds or wants stock: assembled ones and the ones in work. */
	demand(tx?: Tx): DemandRow[] {
		return this.db(tx)
			.select({
				itemId: requestItems.id,
				requestId: requests.id,
				variantId: requestItems.variantId,
				stockItemId: productVariants.stockItemId,
				qty: requestItems.qty,
				status: requests.status,
				isStockRequest: requests.isStockRequest,
				priority: requests.priority,
				deliveryAt: requests.deliveryAt
			})
			.from(requestItems)
			.innerJoin(requests, eq(requests.id, requestItems.requestId))
			.innerJoin(productVariants, eq(productVariants.id, requestItems.variantId))
			.where(
				or(
					eq(requests.status, 'in_work'),
					and(eq(requests.status, 'ready'), eq(requests.isStockRequest, false))
				)
			)
			.all();
	}

	/** The colour of each line; a line without one is the colourless position of its variant. */
	colours(itemIds: readonly number[], tx?: Tx): Map<number, number> {
		if (itemIds.length === 0) return new Map();
		const rows = this.db(tx)
			.select({ itemId: requestItemOptions.itemId, optionId: options.id })
			.from(requestItemOptions)
			.innerJoin(options, eq(options.id, requestItemOptions.optionId))
			.where(and(inArray(requestItemOptions.itemId, [...itemIds]), eq(options.kind, 'color')))
			.all();
		return new Map(rows.map((row) => [row.itemId, row.optionId]));
	}

	/** Balance of every product position: the sum of its moves, never stored (tech.md 5.7). */
	balances(tx?: Tx): Map<string, number> {
		const rows = this.db(tx)
			.select({
				stockItemId: stockMoves.stockItemId,
				optionId: stockMoves.optionId,
				qty: sql<number>`sum(${stockMoves.qty})`
			})
			.from(stockMoves)
			.groupBy(stockMoves.stockItemId, stockMoves.optionId)
			.all();
		return new Map(rows.map((row) => [positionKey(row.stockItemId, row.optionId), row.qty]));
	}
}
