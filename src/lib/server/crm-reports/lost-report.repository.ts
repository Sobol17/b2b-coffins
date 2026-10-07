import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { countExpression, offsetFor } from '../core/list';
import { BaseRepository } from '../core/repository';
import { counterparties, dictItems, requestStatusHistory, requests } from '../db/schema';
import type { ReportWindow } from '$lib/domain/report/period';
import { LOST_STATUSES, type LostStatus } from '$lib/types/crm-reports';
import type { ListQuery } from '$lib/types/list';

export interface LostRow {
	readonly requestId: number;
	readonly number: string;
	readonly status: LostStatus;
	readonly at: Date;
	readonly counterpartyId: number | null;
	readonly counterpartyTitle: string | null;
	readonly reasonTitle: string | null;
	readonly comment: string | null;
	readonly totalMinor: number;
}
export interface LostReasonRow {
	readonly reasonId: number | null;
	readonly title: string | null;
	readonly status: LostStatus;
	readonly count: number;
	readonly totalMinor: number;
}

/** Terminal transitions of the period with the request each one closed (C13). */
export class LostReportRepository extends BaseRepository<typeof requestStatusHistory> {
	constructor() {
		super(requestStatusHistory);
	}

	private lost(window: ReportWindow, status: LostStatus | null) {
		return and(
			inArray(requestStatusHistory.toStatus, status === null ? [...LOST_STATUSES] : [status]),
			gte(requestStatusHistory.createdAt, window.from),
			lt(requestStatusHistory.createdAt, window.to)
		);
	}

	rows(window: ReportWindow, status: LostStatus | null, query: ListQuery<unknown>): LostRow[] {
		return this.db()
			.select({
				requestId: requests.id,
				number: requests.number,
				status: sql<LostStatus>`${requestStatusHistory.toStatus}`,
				at: requestStatusHistory.createdAt,
				counterpartyId: requests.counterpartyId,
				counterpartyTitle: counterparties.name,
				reasonTitle: dictItems.title,
				comment: requestStatusHistory.comment,
				totalMinor: requests.totalMinor
			})
			.from(requestStatusHistory)
			.innerJoin(requests, eq(requests.id, requestStatusHistory.requestId))
			.leftJoin(counterparties, eq(counterparties.id, requests.counterpartyId))
			.leftJoin(dictItems, eq(dictItems.id, requestStatusHistory.reasonId))
			.where(this.lost(window, status))
			.orderBy(desc(requestStatusHistory.createdAt), desc(requestStatusHistory.id))
			.limit(query.perPage)
			.offset(offsetFor(query))
			.all();
	}

	total(window: ReportWindow, status: LostStatus | null): number {
		const [row] = this.db()
			.select({ total: countExpression })
			.from(requestStatusHistory)
			.where(this.lost(window, status))
			.all();
		return row?.total ?? 0;
	}

	/** One row per reason and status: the service folds them into the summary and the counters. */
	reasons(window: ReportWindow, status: LostStatus | null): LostReasonRow[] {
		return this.db()
			.select({
				reasonId: requestStatusHistory.reasonId,
				title: dictItems.title,
				status: sql<LostStatus>`${requestStatusHistory.toStatus}`,
				count: countExpression,
				totalMinor: sql<number>`coalesce(sum(${requests.totalMinor}), 0)`
			})
			.from(requestStatusHistory)
			.innerJoin(requests, eq(requests.id, requestStatusHistory.requestId))
			.leftJoin(dictItems, eq(dictItems.id, requestStatusHistory.reasonId))
			.where(this.lost(window, status))
			.groupBy(requestStatusHistory.reasonId, requestStatusHistory.toStatus)
			.all();
	}
}
