import { and, asc, desc, eq, gte, inArray, like, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import { countExpression } from '../core/list';
import { productVariants, products, requestItems, requests, users } from '../db/schema';
import type { DateWindow } from '$lib/domain/request/registry';
import type { ActorContext } from '$lib/types/actor';
import type { RequestPriority, RequestSort, RequestStatus } from '$lib/types/request';

export interface RegistryQuery {
	/** True for an employee: the whole counterparty belongs to the administrator only (P6). */
	readonly ownOnly: boolean;
	readonly statuses: readonly RequestStatus[];
	readonly window: DateWindow;
	readonly search: string | undefined;
	readonly sort: RequestSort;
	readonly dir: 'asc' | 'desc';
	readonly limit: number;
	readonly offset: number;
}

export interface RegistryRow {
	readonly id: number;
	readonly number: string;
	readonly status: RequestStatus;
	readonly priority: RequestPriority;
	readonly externalNumber: string | null;
	readonly authorName: string | null;
	readonly createdAt: Date;
	readonly submittedAt: Date | null;
	readonly readyAt: Date | null;
	readonly deliveredAt: Date | null;
	readonly totalMinor?: number;
	readonly paidMinor?: number;
}

export interface RegistrySummary {
	readonly itemCount: number;
	readonly unitCount: number;
	readonly firstItemTitle: string | null;
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
	deliveredAt: requests.deliveredAt
};

const MONEY_COLUMNS = { totalMinor: requests.totalMinor, paidMinor: requests.paidMinor };

const SORT_COLUMNS = {
	submittedAt: requests.submittedAt,
	number: requests.number,
	total: requests.totalMinor
} as const;

/** Reads the portal registry. Which rows the actor may see is decided by the where, every time. */
export class RequestRegistryRepository extends BaseRepository<typeof requests> {
	constructor() {
		super(requests);
	}

	page(ctx: ActorContext, query: RegistryQuery): RegistryRow[] {
		// A price-blind role never selects a money column, so no amount can leak through the DTO.
		const columns = ctx.canSeePrices ? { ...BASE_COLUMNS, ...MONEY_COLUMNS } : BASE_COLUMNS;
		const order = SORT_COLUMNS[query.sort];
		return this.db()
			.select(columns)
			.from(requests)
			.leftJoin(users, eq(users.id, requests.createdById))
			.where(this.where(ctx, query, query.statuses))
			.orderBy(query.dir === 'asc' ? asc(order) : desc(order), desc(requests.id))
			.limit(query.limit)
			.offset(query.offset)
			.all();
	}

	total(ctx: ActorContext, query: RegistryQuery): number {
		const [row] = this.db()
			.select({ count: countExpression })
			.from(requests)
			.where(this.where(ctx, query, query.statuses))
			.all();
		return row?.count ?? 0;
	}

	/** Chips count the set the other filters leave, so switching a chip shows where the rows went. */
	countsByStatus(ctx: ActorContext, query: RegistryQuery): Map<RequestStatus, number> {
		const rows = this.db()
			.select({ status: requests.status, count: countExpression })
			.from(requests)
			.where(this.where(ctx, query, []))
			.groupBy(requests.status)
			.all();
		return new Map(rows.map((row) => [row.status, row.count]));
	}

	/** Lines of the listed requests folded into one row each: count, pieces and the first model. */
	summaries(requestIds: readonly number[]): Map<number, RegistrySummary> {
		if (requestIds.length === 0) return new Map();
		const rows = this.db()
			.select({
				requestId: requestItems.requestId,
				itemCount: countExpression,
				unitCount: sql<number>`coalesce(sum(${requestItems.qty}), 0)`,
				firstItemTitle: sql<string | null>`min(${products.title})`
			})
			.from(requestItems)
			.innerJoin(productVariants, eq(productVariants.id, requestItems.variantId))
			.innerJoin(products, eq(products.id, productVariants.productId))
			.where(inArray(requestItems.requestId, [...requestIds]))
			.groupBy(requestItems.requestId)
			.all();
		return new Map(rows.map(({ requestId, ...summary }) => [requestId, summary]));
	}

	private where(
		ctx: ActorContext,
		query: RegistryQuery,
		statuses: readonly RequestStatus[]
	): SQL | undefined {
		return this.scopedWhere(
			ctx,
			(counterpartyId) => eq(requests.counterpartyId, counterpartyId),
			and(
				// The cart owns the draft: the registry starts where the request was sent (tech.md 6.1).
				ne(requests.status, 'draft'),
				query.ownOnly ? eq(requests.createdById, ctx.userId) : undefined,
				statuses.length === 0 ? undefined : inArray(requests.status, [...statuses]),
				query.window.from === undefined ? undefined : gte(requests.submittedAt, query.window.from),
				query.window.to === undefined ? undefined : lte(requests.submittedAt, query.window.to),
				this.searchWhere(query.search)
			)
		);
	}

	private searchWhere(search: string | undefined): SQL | undefined {
		if (search === undefined || search.trim() === '') return undefined;
		const pattern = `%${search.trim()}%`;
		return or(like(requests.number, pattern), like(requests.externalNumber, pattern));
	}
}
