import type { Tx } from '../db/client';
import { StockFill } from '../stock/stock-fill';
import { ShopArrivals } from './shop-arrivals';
import { ShopJobRepository } from './shop-job.repository';
import { planDispatch, type DispatchLine } from '$lib/domain/shop/dispatch';
import { shelfWant } from '$lib/domain/stock/allocation';

export interface DispatchOutcome {
	readonly added: number;
	readonly shrunk: number;
	readonly openedTaskIds: number[];
}

/**
 * Brings the shop in line with the fill of the shelf (tech.md §20.4). It runs inside the
 * transaction of every action that moves the fill, so a rerun on the same data writes nothing.
 */
export class ShopDispatch {
	constructor(
		private readonly fill: StockFill = new StockFill(),
		private readonly jobs: ShopJobRepository = new ShopJobRepository(),
		private readonly arrivals: ShopArrivals = new ShopArrivals(),
		private readonly now: () => Date = () => new Date()
	) {}

	run(tx: Tx): DispatchOutcome {
		const steps = planDispatch(this.lines(tx), this.jobs.openJobs(tx));
		const openedTaskIds: number[] = [];
		let added = 0;
		let shrunk = 0;
		const removed: number[] = [];
		for (const step of steps) {
			if (step.kind === 'add') {
				const arrival = this.arrivals.arrive(
					{ requestId: step.requestId, itemId: step.itemId, station: 'carpenter', qty: step.qty },
					tx
				);
				if (arrival.opened) openedTaskIds.push(arrival.taskId);
				added += step.qty;
			} else if (step.qty === 0) {
				removed.push(step.jobId);
				shrunk += 1;
			} else {
				this.jobs.setJobQty(step.jobId, step.qty, tx);
				shrunk += 1;
			}
		}
		this.jobs.deleteJobs(removed, tx);
		if (removed.length > 0) this.jobs.closeEmptied(this.now(), tx);
		return { added, shrunk, openedTaskIds };
	}

	/** Counterparty lines in work against the shelf, stock lines against what the shop finished. */
	private lines(tx: Tx): DispatchLine[] {
		const { lines, filled } = this.fill.read(tx);
		const counterparty = lines
			.filter((line) => line.tier === 'work')
			.map((line) => ({
				itemId: line.itemId,
				requestId: line.requestId,
				wantQty: shelfWant(line),
				filledQty: filled.get(line.itemId) ?? 0
			}));
		const stock = this.jobs.stockLines(tx).map((line) => ({
			itemId: line.itemId,
			requestId: line.requestId,
			wantQty: Math.max(0, line.qty - line.madeQty),
			filledQty: 0
		}));
		return [...counterparty, ...stock];
	}
}
