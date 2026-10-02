import { and, eq } from 'drizzle-orm';
import type { Db } from '../../../src/lib/server/db/client';
import {
	dictItems,
	inventories,
	jobQueue,
	stockItems,
	stockMoves
} from '../../../src/lib/server/db/schema';
import type { DictCode } from '../../../src/lib/types/dicts';

export function stockItemId(db: Db, code: string): number {
	const [row] = db.select().from(stockItems).where(eq(stockItems.code, code)).all();
	if (!row) throw new Error(`stock item ${code} is not seeded`);
	return row.id;
}

export function dictId(db: Db, dict: DictCode, code: string): number {
	const [row] = db
		.select()
		.from(dictItems)
		.where(and(eq(dictItems.dict, dict), eq(dictItems.code, code)))
		.all();
	if (!row) throw new Error(`dict item ${dict}/${code} is not seeded`);
	return row.id;
}

export function movesOf(db: Db, itemId: number) {
	return db
		.select()
		.from(stockMoves)
		.where(eq(stockMoves.stockItemId, itemId))
		.orderBy(stockMoves.id)
		.all();
}

export function thresholdJobs(db: Db) {
	return db.select().from(jobQueue).where(eq(jobQueue.topic, 'stock.threshold.check')).all();
}

export function fanoutJobs(db: Db) {
	return db.select().from(jobQueue).where(eq(jobQueue.topic, 'notification.fanout')).all();
}

/** Inventories and their lines go before the moves: the next test starts from an empty shelf. */
export function resetInventories(db: Db): void {
	db.delete(inventories).run();
}
