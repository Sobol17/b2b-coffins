import { and, eq, ne } from 'drizzle-orm';
import { countExpression } from '../core/list';
import { BaseRepository } from '../core/repository';
import { BELOW_THRESHOLD } from '../crm-stock/stock-item.repository';
import { requests, stockItems } from '../db/schema';
import type { RequestStatus } from '$lib/types/request';

/** The state of the workshop right now: it does not depend on the period of the dashboard. */
export class DashboardRepository extends BaseRepository<typeof requests> {
	constructor() {
		super(requests);
	}

	statusCounts(): Map<RequestStatus, number> {
		return new Map(
			this.db()
				.select({ status: requests.status, count: countExpression })
				.from(requests)
				.where(ne(requests.status, 'draft'))
				.groupBy(requests.status)
				.all()
				.map((row) => [row.status, row.count])
		);
	}

	/** The same rule the registry of the warehouse filters by (C8): a threshold of zero is none. */
	belowThresholdCount(): number {
		const [row] = this.db()
			.select({ count: countExpression })
			.from(stockItems)
			.where(and(eq(stockItems.isActive, true), BELOW_THRESHOLD))
			.all();
		return row?.count ?? 0;
	}
}
