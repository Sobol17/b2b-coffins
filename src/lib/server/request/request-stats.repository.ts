import { ne } from 'drizzle-orm';
import { countExpression } from '../core/list';
import { BaseRepository } from '../core/repository';
import { requests } from '../db/schema';
import { REQUEST_STATUSES, type RequestStatus } from '$lib/types/request';

/** Aggregates for CRM counters. No row data leaves this method, only totals per status. */
export class RequestStatsRepository extends BaseRepository<typeof requests> {
	constructor() {
		super(requests);
	}

	countByStatus(): Record<RequestStatus, number> {
		const counts = Object.fromEntries(REQUEST_STATUSES.map((status) => [status, 0])) as Record<
			RequestStatus,
			number
		>;
		// Drafts belong to the portal and never show up in CRM registries (tech.md 6.1).
		const rows = this.db()
			.select({ status: requests.status, count: countExpression })
			.from(requests)
			.where(ne(requests.status, 'draft'))
			.groupBy(requests.status)
			.all();
		for (const row of rows) counts[row.status] = row.count;
		return counts;
	}
}
