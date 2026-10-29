import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { requestItems, shopJobs } from '../db/schema';

/** Jobs of the stations, read and written by line (tech.md §5.12). */
export class ShopJobRepository extends BaseRepository<typeof shopJobs> {
	constructor() {
		super(shopJobs);
	}

	/** Pieces past the upholsterer per line of the request: what a stock request counts as made. */
	madeByItem(requestId: number, tx?: Tx): Map<number, number> {
		const rows = this.db(tx)
			.select({ itemId: shopJobs.requestItemId, qty: sql<number>`sum(${shopJobs.qty})` })
			.from(shopJobs)
			.innerJoin(requestItems, eq(requestItems.id, shopJobs.requestItemId))
			.where(and(eq(requestItems.requestId, requestId), isNotNull(shopJobs.finishedAt)))
			.groupBy(shopJobs.requestItemId)
			.all();
		return new Map(rows.map((row) => [row.itemId, Number(row.qty)]));
	}
}
