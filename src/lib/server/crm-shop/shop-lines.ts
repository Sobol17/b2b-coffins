import type { Tx } from '../db/client';
import { StockFill } from '../stock/stock-fill';
import { ShopJobRepository } from './shop-job.repository';
import { heldAhead } from '$lib/domain/stock/allocation';
import type { CrmLineShopDto } from '$lib/types/crm-shop';
import type { RequestStatus } from '$lib/types/request';
import { WORK_ROLES } from '$lib/types/roles';

/**
 * The shop side of each line of a request in work (tech.md §8): what the shelf gives it, what the
 * stations make, and which requests ahead in the queue hold the rest of its position.
 */
export class ShopLineReader {
	constructor(
		private readonly fill: StockFill = new StockFill(),
		private readonly jobs: ShopJobRepository = new ShopJobRepository()
	) {}

	forRequest(
		request: { readonly id: number; readonly status: RequestStatus },
		itemIds: readonly number[],
		tx?: Tx
	): CrmLineShopDto[] {
		if (request.status !== 'in_work') return [];
		const snapshot = this.fill.read(tx);
		const open = this.jobs.openJobs(tx);
		const made = this.jobs.madeByItem(request.id, tx);
		const ahead = new Map(
			snapshot.lines
				.filter((line) => line.requestId === request.id)
				.map((line) => [line.itemId, heldAhead(line, snapshot.lines, snapshot.filled)])
		);
		const numbers = this.jobs.numbers([...new Set([...ahead.values()].flat())], tx);
		return itemIds.map((itemId) => ({
			itemId,
			fromStockQty: snapshot.filled.get(itemId) ?? 0,
			stations: open
				.filter((job) => job.itemId === itemId)
				.sort((a, b) => WORK_ROLES.indexOf(a.station) - WORK_ROLES.indexOf(b.station))
				.map((job) => ({ station: job.station, qty: job.qty, doneQty: job.doneQty })),
			madeQty: made.get(itemId) ?? 0,
			heldBy: (ahead.get(itemId) ?? []).flatMap((id) => numbers.get(id) ?? [])
		}));
	}
}
