import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../../src/lib/server/db/client';
import { stockItems } from '../../src/lib/server/db/schema';

// The highest filled cost among the live variants of the item: one item usually has one variant.
const VARIANT_COST = sql<number>`(select max(v.cost_price_minor) from product_variants v where v.stock_item_id = stock_items.id and v.deleted_at is null and v.cost_price_minor > 0)`;

/**
 * Moves the cost of a variant to its stock item on a stand updated to v1.62. An item that already
 * has a cost keeps it, so a second run changes nothing.
 */
export function stockCostBackfill(db: Db): { copied: number } {
	const result = db
		.update(stockItems)
		.set({ costPriceMinor: VARIANT_COST })
		.where(and(eq(stockItems.costPriceMinor, 0), sql`${VARIANT_COST} is not null`))
		.run();
	return { copied: result.changes };
}

export function stockCostBackfillCommand(db: Db): void {
	console.log(JSON.stringify(db.transaction(() => stockCostBackfill(db))));
}
