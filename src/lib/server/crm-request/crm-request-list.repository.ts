import { and, asc, desc, eq, gte, inArray, ne, or, sql, type SQL } from 'drizzle-orm';
import { countExpression } from '../core/list';
import { BaseRepository } from '../core/repository';
import { counterparties, paymentMarks, requests, users } from '../db/schema';
import type { RegistryRow } from '../request/request-registry.repository';
import { BOARD_ORDER, criteriaWhere, type CrmRequestCriteria } from './crm-request-query';
import type { SettlementScheme } from '$lib/types/counterparty';
import type { CrmRequestSort } from '$lib/types/crm-request';
import type { RequestStatus } from '$lib/types/request';

export interface CrmListRow extends RegistryRow {
	readonly counterpartyId: number | null;
	readonly counterpartyName: string | null;
	readonly isStockRequest: boolean;
	readonly deliveryAt: Date | null;
	readonly scheme: SettlementScheme | null;
}

export interface ListSlice {
	readonly sort: CrmRequestSort;
	readonly dir: 'asc' | 'desc';
	readonly limit: number;
	readonly offset: number;
}

const BASE_COLUMNS = {
	id: requests.id,
	number: requests.number,
	status: requests.status,
	priority: requests.priority,
	externalNumber: requests.externalNumber,
	authorName: users.fullName,
	createdAt: requests.createdAt,
	submittedAt: requests.submittedAt,
	readyAt: requests.readyAt,
	deliveredAt: requests.deliveredAt,
	counterpartyId: requests.counterpartyId,
	counterpartyName: counterparties.name,
	isStockRequest: requests.isStockRequest,
	deliveryAt: requests.deliveryAt,
	scheme: counterparties.settlementScheme
};

// Paid is read from the marks, like the debt of C3: two answers to one question are not allowed.
const MONEY_COLUMNS = {
	totalMinor: requests.totalMinor,
	paidMinor: sql<number>`coalesce((select sum(${paymentMarks.amountMinor}) from ${paymentMarks} where ${paymentMarks.requestId} = ${requests.id}), 0)`
};

const SORT_COLUMNS = {
	submittedAt: requests.submittedAt,
	number: requests.number,
	deliveryAt: requests.deliveryAt,
	total: requests.totalMinor
} as const;

/** Requests of the whole workshop: the registry, the board columns and the export (C4). */
export class CrmRequestListRepository extends BaseRepository<typeof requests> {
	constructor() {
		super(requests);
	}

	page(criteria: CrmRequestCriteria, slice: ListSlice, withMoney: boolean): CrmListRow[] {
		const order = SORT_COLUMNS[slice.sort];
		return this.rows(criteriaWhere(criteria), withMoney)
			.orderBy(slice.dir === 'asc' ? asc(order) : desc(order), desc(requests.id))
			.limit(slice.limit)
			.offset(slice.offset)
			.all();
	}

	total(criteria: CrmRequestCriteria): number {
		const [row] = this.db()
			.select({ count: countExpression })
			.from(requests)
			.leftJoin(counterparties, eq(counterparties.id, requests.counterpartyId))
			.where(criteriaWhere(criteria))
			.all();
		return row?.count ?? 0;
	}

	/** One column of the board, in the order the workshop takes the requests on. */
	column(
		criteria: CrmRequestCriteria,
		status: RequestStatus,
		paidSince: Date,
		limit: number,
		withMoney: boolean
	): CrmListRow[] {
		return this.rows(this.boardWhere(criteria, paidSince, [status]), withMoney)
			.orderBy(...BOARD_ORDER)
			.limit(limit)
			.all();
	}

	columnTotals(
		criteria: CrmRequestCriteria,
		statuses: readonly RequestStatus[],
		paidSince: Date
	): Map<RequestStatus, number> {
		const rows = this.db()
			.select({ status: requests.status, count: countExpression })
			.from(requests)
			.leftJoin(counterparties, eq(counterparties.id, requests.counterpartyId))
			.where(this.boardWhere(criteria, paidSince, statuses))
			.groupBy(requests.status)
			.all();
		return new Map(rows.map((row) => [row.status, row.count]));
	}

	private rows(where: SQL | undefined, withMoney: boolean) {
		// A price-blind role never selects a money column, so no amount can leak through the DTO.
		return this.db()
			.select(withMoney ? { ...BASE_COLUMNS, ...MONEY_COLUMNS } : BASE_COLUMNS)
			.from(requests)
			.leftJoin(users, eq(users.id, requests.createdById))
			.leftJoin(counterparties, eq(counterparties.id, requests.counterpartyId))
			.where(where)
			.$dynamic();
	}

	/** The paid column keeps the last days only: a closed request has nothing left to steer. */
	private boardWhere(
		criteria: CrmRequestCriteria,
		paidSince: Date,
		statuses: readonly RequestStatus[]
	): SQL | undefined {
		return and(
			criteriaWhere(criteria),
			inArray(requests.status, [...statuses]),
			or(ne(requests.status, 'paid'), gte(requests.paidAt, paidSince))
		);
	}
}
