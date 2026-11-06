import type { Tx } from '../db/client';
import { StockFill } from '../stock/stock-fill';
import { ShopJobRepository } from './shop-job.repository';
import { ShopUnitHistoryRepository } from './shop-unit-history.repository';
import { heldAhead } from '$lib/domain/stock/allocation';
import type { CrmLineShopDto, ShopUnitHistoryDto } from '$lib/types/crm-shop';
import type { RequestStatus } from '$lib/types/request';
import { WORK_ROLES } from '$lib/types/roles';
import { definedProps } from '$lib/utils/props';

/**
 * The shop side of each request line: live aggregates in work and executor history after it.
 */
export class ShopLineReader {
	constructor(
		private readonly fill: StockFill = new StockFill(),
		private readonly jobs: ShopJobRepository = new ShopJobRepository(),
		private readonly history: ShopUnitHistoryRepository = new ShopUnitHistoryRepository()
	) {}

	forRequest(
		request: { readonly id: number; readonly status: RequestStatus },
		itemIds: readonly number[],
		tx?: Tx
	): CrmLineShopDto[] {
		const history = this.history.byItems(itemIds, tx);
		if (request.status !== 'in_work' && history.size === 0) return [];
		const made = this.jobs.madeByItem(request.id, tx);
		if (request.status !== 'in_work') return this.finishedLines(itemIds, history, made);
		const snapshot = this.fill.read(tx);
		const open = this.jobs.openJobs(tx);
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
			heldBy: (ahead.get(itemId) ?? []).flatMap((id) => numbers.get(id) ?? []),
			...definedProps({ units: history.get(itemId) })
		}));
	}

	private finishedLines(
		itemIds: readonly number[],
		history: ReadonlyMap<number, readonly ShopUnitHistoryDto[]>,
		made: ReadonlyMap<number, number>
	): CrmLineShopDto[] {
		return itemIds.flatMap((itemId) => {
			const units = history.get(itemId);
			return units === undefined
				? []
				: [
						{
							itemId,
							fromStockQty: 0,
							stations: [],
							madeQty: made.get(itemId) ?? 0,
							heldBy: [],
							units
						}
					];
		});
	}
}
