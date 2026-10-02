import { eq, sql } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { stockItems, stockMoves } from '../db/schema';
import { Queue } from '../queue/queue';
import { jobKey } from '../queue/topics';
import { isBelowThreshold } from '$lib/domain/stock/balance';

export interface ThresholdRow {
	readonly id: number;
	readonly minThreshold: number;
	readonly balance: number;
}

/**
 * The threshold watch of tech.md v1.45. The item is watched as a whole: a product sums all its
 * colours. A move that leaves the item under its threshold queues `stock.threshold.check` in its
 * own transaction; the day in the key keeps a low shelf to one signal a day.
 */
export class StockThreshold extends BaseRepository<typeof stockItems> {
	constructor() {
		super(stockItems);
	}

	read(stockItemId: number, tx?: Tx): ThresholdRow | undefined {
		const [row] = this.db(tx)
			.select({
				id: stockItems.id,
				minThreshold: stockItems.minThreshold,
				balance: sql<number>`coalesce(sum(${stockMoves.qty}), 0)`
			})
			.from(stockItems)
			.leftJoin(stockMoves, eq(stockMoves.stockItemId, stockItems.id))
			.where(eq(stockItems.id, stockItemId))
			.groupBy(stockItems.id)
			.all();
		return row;
	}

	isBelow(stockItemId: number, tx?: Tx): boolean {
		const row = this.read(stockItemId, tx);
		return row !== undefined && isBelowThreshold(row.balance, row.minThreshold);
	}

	/** Call after the move is written, inside its transaction. */
	watch(stockItemId: number, tx: Tx, now: Date): void {
		if (!this.isBelow(stockItemId, tx)) return;
		Queue.enqueue('stock.threshold.check', { stockItemId }, jobKey.threshold(stockItemId, now), tx);
	}
}
