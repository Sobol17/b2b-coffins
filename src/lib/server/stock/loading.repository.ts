import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
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
import type { RequestStatus } from '$lib/types/request';

/** A request line with what a loading needs to know about it and its position. */
export interface LoadingLineRow {
	readonly itemId: number;
	readonly requestId: number;
	readonly status: RequestStatus;
	readonly isStockRequest: boolean;
	readonly qty: number;
	readonly stockItemId: number | null;
	readonly optionId: number | null;
}

export interface LoadingMove {
	readonly requestId: number;
	readonly itemId: number;
	readonly stockItemId: number;
	readonly optionId: number | null;
	/** Signed as on the shelf: minus for a loading, plus for its reversal. */
	readonly qty: number;
	readonly actorId: number;
	readonly occurredAt: Date;
	readonly reversalOfId: number | null;
}

/**
 * The loading of C6 lives in the stock journal (tech.md v1.43): a shipment move per mark, carrying
 * its request line, and a reversal per withdrawn mark. Loaded pieces are summed, never stored.
 */
export class LoadingRepository extends BaseRepository<typeof stockMoves> {
	constructor() {
		super(stockMoves);
	}

	/** Loaded pieces per line id; a line nothing was loaded for is absent. */
	loadedByItem(itemIds: readonly number[], tx?: Tx): Map<number, number> {
		if (itemIds.length === 0) return new Map();
		const rows = this.db(tx)
			.select({
				itemId: stockMoves.requestItemId,
				qty: sql<number>`sum(${stockMoves.qty})`
			})
			.from(stockMoves)
			.where(inArray(stockMoves.requestItemId, [...itemIds]))
			.groupBy(stockMoves.requestItemId)
			.all();
		return new Map(rows.flatMap((row) => (row.itemId === null ? [] : [[row.itemId, -row.qty]])));
	}

	/** Every line of one request with its loaded pieces, for guard `fullyLoaded`. */
	linesOf(requestId: number, tx?: Tx): { itemId: number; qty: number; loadedQty: number }[] {
		const lines = this.db(tx)
			.select({ itemId: requestItems.id, qty: requestItems.qty })
			.from(requestItems)
			.where(eq(requestItems.requestId, requestId))
			.all();
		const loaded = this.loadedByItem(
			lines.map((line) => line.itemId),
			tx
		);
		return lines.map((line) => ({ ...line, loadedQty: loaded.get(line.itemId) ?? 0 }));
	}

	lineOf(itemId: number, tx?: Tx): LoadingLineRow | undefined {
		const [row] = this.db(tx)
			.select({
				itemId: requestItems.id,
				requestId: requests.id,
				status: requests.status,
				isStockRequest: requests.isStockRequest,
				qty: requestItems.qty,
				stockItemId: productVariants.stockItemId
			})
			.from(requestItems)
			.innerJoin(requests, eq(requests.id, requestItems.requestId))
			.innerJoin(productVariants, eq(productVariants.id, requestItems.variantId))
			.where(eq(requestItems.id, itemId))
			.all();
		if (!row) return undefined;
		return { ...row, optionId: this.colourOf(itemId, tx) };
	}

	/** Loadings of the line that no reversal has withdrawn yet. */
	openLoadings(itemId: number, tx?: Tx): { id: number; qty: number }[] {
		const reversal = alias(stockMoves, 'reversal');
		return this.db(tx)
			.select({ id: stockMoves.id, qty: stockMoves.qty })
			.from(stockMoves)
			.leftJoin(reversal, eq(reversal.reversalOfId, stockMoves.id))
			.where(
				and(
					eq(stockMoves.requestItemId, itemId),
					eq(stockMoves.type, 'shipment'),
					isNull(reversal.id)
				)
			)
			.orderBy(stockMoves.id)
			.all();
	}

	insert(move: LoadingMove, tx: Tx): number {
		const [row] = this.db(tx)
			.insert(stockMoves)
			.values({
				stockItemId: move.stockItemId,
				optionId: move.optionId,
				qty: move.qty,
				type: move.reversalOfId === null ? 'shipment' : 'reversal',
				requestId: move.requestId,
				requestItemId: move.itemId,
				reversalOfId: move.reversalOfId,
				actorId: move.actorId,
				occurredAt: move.occurredAt
			})
			.returning({ id: stockMoves.id })
			.all();
		if (!row) throw new Error('failed to write a loading move');
		return row.id;
	}

	private colourOf(itemId: number, tx?: Tx): number | null {
		const [row] = this.db(tx)
			.select({ optionId: options.id })
			.from(requestItemOptions)
			.innerJoin(options, eq(options.id, requestItemOptions.optionId))
			.where(and(eq(requestItemOptions.itemId, itemId), eq(options.kind, 'color')))
			.all();
		return row?.optionId ?? null;
	}
}
