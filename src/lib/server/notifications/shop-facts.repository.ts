import { eq } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { requests, shopTasks } from '../db/schema';
import type { RequestPriority } from '$lib/types/request';
import type { WorkRole } from '$lib/types/roles';

/** One visit as the fanout and the push read it at run time (tech.md 7.3). */
export interface ShopOccurrence {
	readonly taskId: number;
	readonly station: WorkRole;
	readonly requestNumber: string;
	readonly priority: RequestPriority;
}

/** The fanout payload carries the visit id only (tech.md 7.1): the station and the request come from the rows. */
export class ShopFactsRepository extends BaseRepository<typeof shopTasks> {
	constructor() {
		super(shopTasks);
	}

	occurrence(taskId: number, tx?: Tx): ShopOccurrence | undefined {
		const [row] = this.db(tx)
			.select({
				taskId: shopTasks.id,
				station: shopTasks.station,
				requestNumber: requests.number,
				priority: requests.priority
			})
			.from(shopTasks)
			.innerJoin(requests, eq(requests.id, shopTasks.requestId))
			.where(eq(shopTasks.id, taskId))
			.all();
		return row;
	}
}
