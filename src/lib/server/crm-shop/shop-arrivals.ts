import type { Tx } from '../db/client';
import { EventBus } from '../events/bus';
import { ShopJobRepository } from './shop-job.repository';
import type { WorkRole } from '$lib/types/roles';

export interface Arrival {
	readonly requestId: number;
	readonly itemId: number;
	readonly station: WorkRole;
	readonly qty: number;
}

/**
 * Pieces landing on a station (tech.md §5.12): they join the open visit of the request there, or
 * open one. Only a new visit is news to the station; more pieces in a known visit are not.
 */
export class ShopArrivals {
	constructor(private readonly jobs: ShopJobRepository = new ShopJobRepository()) {}

	arrive(input: Arrival, tx: Tx): { taskId: number; opened: boolean } {
		const { taskId, opened } = this.visit(input.requestId, input.station, tx);
		const job = this.jobs.openJobIn(taskId, input.itemId, tx);
		if (job) this.jobs.setJobQty(job.id, job.qty + input.qty, tx);
		else this.jobs.insertJob({ itemId: input.itemId, taskId, qty: input.qty }, tx);
		return { taskId, opened };
	}

	private visit(requestId: number, station: WorkRole, tx: Tx): { taskId: number; opened: boolean } {
		const open = this.jobs.openTask(requestId, station, tx);
		if (open !== undefined) return { taskId: open, opened: false };
		const taskId = this.jobs.insertTask(requestId, station, tx);
		EventBus.emit('shop.task_arrived', taskId, tx);
		return { taskId, opened: true };
	}
}
