import { and, desc, eq, isNotNull, ne, sql } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { requestItems, requestStatusHistory, requests } from '../db/schema';
import type { RequestTotals } from '$lib/domain/request/pricing';
import type { ActorContext } from '$lib/types/actor';
import type { RequestStatus } from '$lib/types/request';

export interface DraftRow {
	readonly id: number;
	readonly number: string;
	readonly createdById: number;
	readonly deliveryAddressId: number | null;
	readonly isPickup: boolean;
	readonly comment: string | null;
	readonly updatedAt: Date;
}

export interface DraftDetails {
	readonly deliveryAddressId: number | null;
	readonly isPickup: boolean;
	readonly comment: string | null;
}

export interface SentRow {
	readonly id: number;
	readonly number: string;
	readonly submittedAt: Date | null;
	readonly itemCount: number;
	readonly unitCount: number;
}

const DRAFT_COLUMNS = {
	id: requests.id,
	number: requests.number,
	createdById: requests.createdById,
	deliveryAddressId: requests.deliveryAddressId,
	isPickup: requests.isPickup,
	comment: requests.comment,
	updatedAt: requests.updatedAt
};

/** Requests of the portal while they are drafts, and the moment they are sent. */
export class DraftRepository extends BaseRepository<typeof requests> {
	constructor() {
		super(requests);
	}

	/** The actor's own draft inside the own counterparty (tech.md 12, row-level rule). */
	findDraft(ctx: ActorContext, tx?: Tx): DraftRow | undefined {
		const [row] = this.db(tx)
			.select(DRAFT_COLUMNS)
			.from(requests)
			.where(
				this.scopedWhere(
					ctx,
					(counterpartyId) => eq(requests.counterpartyId, counterpartyId),
					and(eq(requests.status, 'draft'), eq(requests.createdById, ctx.userId))
				)
			)
			.orderBy(desc(requests.id))
			.limit(1)
			.all();
		return row;
	}

	createDraft(
		values: {
			number: string;
			counterpartyId: number;
			createdById: number;
			deliveryAddressId: number | null;
		},
		tx: Tx
	): DraftRow {
		const [row] = this.db(tx)
			.insert(requests)
			.values({ ...values, status: 'draft' })
			.returning(DRAFT_COLUMNS)
			.all();
		if (!row) throw new Error('failed to create a draft request');
		return row;
	}

	/** Money of a request. Called only for a role that may see it. */
	totals(id: number): RequestTotals | undefined {
		const [row] = this.db()
			.select({
				itemsTotalMinor: requests.itemsTotalMinor,
				discountMinor: requests.discountMinor,
				totalMinor: requests.totalMinor
			})
			.from(requests)
			.where(eq(requests.id, id))
			.all();
		return row;
	}

	saveTotals(id: number, totals: RequestTotals, tx: Tx): void {
		this.db(tx).update(requests).set(totals).where(eq(requests.id, id)).run();
	}

	saveDetails(id: number, details: DraftDetails, tx: Tx): void {
		this.db(tx).update(requests).set(details).where(eq(requests.id, id)).run();
	}

	/** Guarded by the status in the WHERE: a second send of the same draft changes nothing. */
	markSubmitted(id: number, at: Date, tx: Tx): boolean {
		return (
			this.db(tx)
				.update(requests)
				.set({ status: 'new', submittedAt: at })
				.where(and(eq(requests.id, id), eq(requests.status, 'draft')))
				.run().changes > 0
		);
	}

	insertHistory(
		entry: {
			requestId: number;
			fromStatus: RequestStatus | null;
			toStatus: RequestStatus;
			actorId: number | null;
		},
		tx: Tx
	): void {
		this.db(tx).insert(requestStatusHistory).values(entry).run();
	}

	/** A sent request of the counterparty. With `ownOnly` an employee reaches only the own ones. */
	findSent(ctx: ActorContext, id: number, ownOnly: boolean): { id: number } | undefined {
		const [row] = this.db()
			.select({ id: requests.id })
			.from(requests)
			.where(this.sentWhere(ctx, ownOnly, eq(requests.id, id)))
			.all();
		return row;
	}

	lastSent(ctx: ActorContext, ownOnly: boolean): SentRow | undefined {
		const [row] = this.db()
			.select({
				id: requests.id,
				number: requests.number,
				submittedAt: requests.submittedAt,
				itemCount: sql<number>`count(${requestItems.id})`,
				unitCount: sql<number>`coalesce(sum(${requestItems.qty}), 0)`
			})
			.from(requests)
			// A join, not a correlated subquery: drizzle renders the outer column unqualified there.
			.leftJoin(requestItems, eq(requestItems.requestId, requests.id))
			.where(this.sentWhere(ctx, ownOnly, isNotNull(requests.submittedAt)))
			.groupBy(requests.id)
			.orderBy(desc(requests.submittedAt), desc(requests.id))
			.limit(1)
			.all();
		return row;
	}

	private sentWhere(ctx: ActorContext, ownOnly: boolean, extra: ReturnType<typeof eq>) {
		return this.scopedWhere(
			ctx,
			(counterpartyId) => eq(requests.counterpartyId, counterpartyId),
			and(
				ne(requests.status, 'draft'),
				ownOnly ? eq(requests.createdById, ctx.userId) : undefined,
				extra
			)
		);
	}
}
