import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import { counterparties, productVariants, products, requestItems, requests } from '../db/schema';
import type { ReportWindow } from '$lib/domain/report/period';
import type { RequestStatus } from '$lib/types/request';

/** A sale is a counterparty request that reached the door (tech.md v1.51). */
export const SALE_STATUSES: readonly RequestStatus[] = ['delivered', 'awaiting_payment', 'paid'];

export interface SaleRow {
	readonly counterpartyId: number;
	readonly counterpartyName: string;
	readonly deliveredAt: Date;
	readonly qty: number;
	readonly itemsTotalMinor: number;
	readonly discountMinor: number;
	readonly totalMinor: number;
	readonly paidMinor: number;
}

export interface ModelSaleRow {
	readonly modelId: number;
	readonly title: string;
	readonly requestCount: number;
	readonly qty: number;
	readonly linesTotalMinor: number;
}

const QTY = sql<number>`coalesce((select sum(i.qty) from request_items i where i.request_id = ${requests.id}), 0)`;

export class SalesReportRepository extends BaseRepository<typeof requests> {
	constructor() {
		super(requests);
	}

	private sold(window: ReportWindow, counterpartyId: number | null) {
		return and(
			eq(requests.isStockRequest, false),
			inArray(requests.status, [...SALE_STATUSES]),
			gte(requests.deliveredAt, window.from),
			lt(requests.deliveredAt, window.to),
			counterpartyId === null ? undefined : eq(requests.counterpartyId, counterpartyId)
		);
	}

	/** One row per sold request: the service folds them by counterparty and by bucket. */
	sales(window: ReportWindow, counterpartyId: number | null): SaleRow[] {
		const rows = this.db()
			.select({
				counterpartyId: requests.counterpartyId,
				counterpartyName: counterparties.name,
				deliveredAt: requests.deliveredAt,
				qty: QTY,
				itemsTotalMinor: requests.itemsTotalMinor,
				discountMinor: requests.discountMinor,
				totalMinor: requests.totalMinor,
				paidMinor: requests.paidMinor
			})
			.from(requests)
			.innerJoin(counterparties, eq(counterparties.id, requests.counterpartyId))
			.where(this.sold(window, counterpartyId))
			.all();
		return rows.flatMap((row) =>
			row.counterpartyId === null || row.deliveredAt === null
				? []
				: [{ ...row, counterpartyId: row.counterpartyId, deliveredAt: row.deliveredAt }]
		);
	}

	/** Lines of the sold requests by model, best seller first. */
	byModel(window: ReportWindow, counterpartyId: number | null): ModelSaleRow[] {
		const total = sql<number>`coalesce(sum(${requestItems.lineTotalMinor}), 0)`;
		return this.db()
			.select({
				modelId: products.id,
				title: products.title,
				requestCount: sql<number>`count(distinct ${requests.id})`,
				qty: sql<number>`coalesce(sum(${requestItems.qty}), 0)`,
				linesTotalMinor: total
			})
			.from(requestItems)
			.innerJoin(requests, eq(requests.id, requestItems.requestId))
			.innerJoin(productVariants, eq(productVariants.id, requestItems.variantId))
			.innerJoin(products, eq(products.id, productVariants.productId))
			.where(this.sold(window, counterpartyId))
			.groupBy(products.id)
			.orderBy(desc(total), products.title)
			.all();
	}
}
