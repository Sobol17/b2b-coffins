import type { Tx } from '../db/client';
import { StockFillRepository } from './stock-fill.repository';
import { allocateStock, fillTier, isCovered, type DemandLine } from '$lib/domain/stock/allocation';

export interface StockFillSnapshot {
	readonly lines: readonly DemandLine[];
	/** Filled pieces per line id. */
	readonly filled: ReadonlyMap<number, number>;
	/** Balance per position key, as the moves sum it. */
	readonly balances: ReadonlyMap<string, number>;
}

/**
 * The fill of requests from stock at one moment (tech.md v1.41). The shop screen and guard
 * `stockCovered` read it through here, so the screen never promises what the move refuses.
 */
export class StockFill {
	constructor(private readonly repo: StockFillRepository = new StockFillRepository()) {}

	read(tx?: Tx): StockFillSnapshot {
		const rows = this.repo.demand(tx);
		const colours = this.repo.colours(
			rows.map((row) => row.itemId),
			tx
		);
		const lines = rows.flatMap((row): DemandLine[] => {
			const tier = fillTier(row.status, row.isStockRequest);
			if (tier === null) return [];
			return [
				{
					itemId: row.itemId,
					requestId: row.requestId,
					variantId: row.variantId,
					optionId: colours.get(row.itemId) ?? null,
					stockItemId: row.stockItemId,
					qty: row.qty,
					tier,
					isUrgent: row.priority === 'urgent',
					deliveryAt: row.deliveryAt
				}
			];
		});
		const balances = this.repo.balances(tx);
		return { lines, filled: allocateStock(lines, balances), balances };
	}

	/** Guard `stockCovered` for one request: false for a request outside the fill. */
	covers(requestId: number, tx?: Tx): boolean {
		const { lines, filled } = this.read(tx);
		return isCovered(
			lines.filter((line) => line.requestId === requestId),
			filled
		);
	}
}
