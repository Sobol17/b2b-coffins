import { and, count, eq, gte, lt, sql } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import { requests } from '../db/schema';
import type { ReportWindow } from '$lib/domain/report/period';

export interface FunnelCounts {
	readonly new: number;
	readonly in_work: number;
	readonly ready: number;
	readonly delivered: number;
	readonly paid: number;
	readonly cancelled: number;
	readonly rejected: number;
}

const inStatus = (status: 'cancelled' | 'rejected') =>
	sql<number>`coalesce(sum(case when ${requests.status} = ${status} then 1 else 0 end), 0)`;

export class FunnelReportRepository extends BaseRepository<typeof requests> {
	constructor() {
		super(requests);
	}

	/** The cohort: counterparty requests sent inside the window, wherever they stand now. */
	counts(window: ReportWindow): FunnelCounts {
		const [row] = this.db()
			.select({
				new: count(),
				// count(column) skips nulls: a stamp is set once the request reaches the stage.
				in_work: count(requests.acceptedAt),
				ready: count(requests.readyAt),
				delivered: count(requests.deliveredAt),
				paid: count(requests.paidAt),
				cancelled: inStatus('cancelled'),
				rejected: inStatus('rejected')
			})
			.from(requests)
			.where(
				and(
					eq(requests.isStockRequest, false),
					gte(requests.submittedAt, window.from),
					lt(requests.submittedAt, window.to)
				)
			)
			.all();
		return (
			row ?? { new: 0, in_work: 0, ready: 0, delivered: 0, paid: 0, cancelled: 0, rejected: 0 }
		);
	}
}
