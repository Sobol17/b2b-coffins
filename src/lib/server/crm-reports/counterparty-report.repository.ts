import { and, asc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import { counterparties, requests } from '../db/schema';
import { SALE_STATUSES } from './sales-report.repository';
import type { ReportWindow } from '$lib/domain/report/period';
import type { RequestStatus } from '$lib/types/request';

/** One sold request with its cost: what the margin report folds by counterparty. */
export interface MarginSaleRow {
	readonly id: number;
	readonly number: string;
	readonly status: RequestStatus;
	readonly counterpartyId: number | null;
	readonly counterpartyName: string;
	readonly deliveredAt: Date | null;
	readonly qty: number;
	readonly totalMinor: number;
	readonly paidMinor: number;
	readonly costMinor: number;
	readonly uncostedQty: number;
}

// Cost of a line is its pieces times the cost of the variant's stock item today (tech.md v1.63).
// Table names are spelled out: inside a subquery a bare "id" would bind to the inner table.
const LINES = sql`from request_items i join product_variants v on v.id = i.variant_id left join stock_items s on s.id = v.stock_item_id where i.request_id = requests.id`;
const QTY = sql<number>`coalesce((select sum(i.qty) ${LINES}), 0)`;
const COST = sql<number>`coalesce((select sum(i.qty * coalesce(s.cost_price_minor, 0)) ${LINES}), 0)`;
const UNCOSTED = sql<number>`coalesce((select sum(i.qty) ${LINES} and coalesce(s.cost_price_minor, 0) = 0), 0)`;

export class CounterpartyReportRepository extends BaseRepository<typeof requests> {
	constructor() {
		super(requests);
	}

	/** Sold counterparty requests of the window, the oldest delivery first. */
	sales(window: ReportWindow, counterpartyId: number | null): MarginSaleRow[] {
		return this.db()
			.select({
				id: requests.id,
				number: requests.number,
				status: requests.status,
				counterpartyId: requests.counterpartyId,
				counterpartyName: counterparties.name,
				deliveredAt: requests.deliveredAt,
				qty: QTY,
				totalMinor: requests.totalMinor,
				paidMinor: requests.paidMinor,
				costMinor: COST,
				uncostedQty: UNCOSTED
			})
			.from(requests)
			.innerJoin(counterparties, eq(counterparties.id, requests.counterpartyId))
			.where(
				and(
					eq(requests.isStockRequest, false),
					inArray(requests.status, [...SALE_STATUSES]),
					gte(requests.deliveredAt, window.from),
					lt(requests.deliveredAt, window.to),
					counterpartyId === null ? undefined : eq(requests.counterpartyId, counterpartyId)
				)
			)
			.orderBy(asc(requests.deliveredAt), asc(requests.id))
			.all();
	}
}
