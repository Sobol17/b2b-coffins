import { and, eq, inArray, ne, type SQL } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import {
	dictItems,
	paymentMarks,
	requestAssignees,
	requestItems,
	requestStatusHistory,
	requests
} from '../db/schema';
import type { GuardFacts } from '$lib/domain/request/guards';
import type { StampField } from '$lib/domain/request/transition-flow';
import type { ActorContext } from '$lib/types/actor';
import type { RequestStatus } from '$lib/types/request';

export interface TransitionRow {
	readonly id: number;
	readonly number: string;
	readonly status: RequestStatus;
	readonly counterpartyId: number | null;
	readonly createdById: number;
}

export interface HistoryEntry {
	readonly requestId: number;
	readonly fromStatus: RequestStatus;
	readonly toStatus: RequestStatus;
	readonly actorId: number | null;
	readonly reasonId: number | null;
	readonly comment: string | null;
}

/** What a status move reads and writes. Deciding whether the move is allowed is not its job. */
export class RequestTransitionRepository extends BaseRepository<typeof requests> {
	constructor() {
		super(requests);
	}

	/**
	 * A sent request the actor can reach: the own counterparty on the portal (only the own requests
	 * for an employee), any request for a CRM role that reads all, the assigned ones for the crew.
	 */
	findVisible(ctx: ActorContext, id: number, scope: VisibilityScope, tx?: Tx) {
		const [row] = this.db(tx)
			.select({
				id: requests.id,
				number: requests.number,
				status: requests.status,
				counterpartyId: requests.counterpartyId,
				createdById: requests.createdById
			})
			.from(requests)
			.where(this.visibleWhere(ctx, scope, and(eq(requests.id, id), ne(requests.status, 'draft'))))
			.all();
		return row satisfies TransitionRow | undefined;
	}

	/** Existence only, so a foreign request answers 403 and a missing one 404. */
	exists(id: number, tx?: Tx): boolean {
		return (
			this.db(tx)
				.select({ id: requests.id })
				.from(requests)
				.where(and(eq(requests.id, id), ne(requests.status, 'draft')))
				.all().length > 0
		);
	}

	isAssigned(requestId: number, userId: number, tx?: Tx): boolean {
		return (
			this.db(tx)
				.select({ userId: requestAssignees.userId })
				.from(requestAssignees)
				.where(and(eq(requestAssignees.requestId, requestId), eq(requestAssignees.userId, userId)))
				.all().length > 0
		);
	}

	guardFacts(requestId: number, tx?: Tx): GuardFacts {
		const db = this.db(tx);
		const [row] = db
			.select({
				totalMinor: requests.totalMinor,
				isStockRequest: requests.isStockRequest,
				deliveryAddressId: requests.deliveryAddressId,
				deliveryAt: requests.deliveryAt,
				deceasedName: requests.deceasedName
			})
			.from(requests)
			.where(eq(requests.id, requestId))
			.all();
		return {
			assigneeCount: db
				.select({ userId: requestAssignees.userId })
				.from(requestAssignees)
				.where(eq(requestAssignees.requestId, requestId))
				.all().length,
			unitPricesMinor: db
				.select({ price: requestItems.unitPriceMinor })
				.from(requestItems)
				.where(eq(requestItems.requestId, requestId))
				.all()
				.map((line) => line.price),
			totalMinor: row?.totalMinor ?? 0,
			paymentMarksMinor: db
				.select({ amount: paymentMarks.amountMinor })
				.from(paymentMarks)
				.where(eq(paymentMarks.requestId, requestId))
				.all()
				.map((mark) => mark.amount),
			delivery: {
				isStockRequest: row?.isStockRequest ?? false,
				deliveryAddressId: row?.deliveryAddressId ?? null,
				deliveryAt: row?.deliveryAt ?? null,
				deceasedName: row?.deceasedName ?? null
			}
		};
	}

	/** A rejection names its reason from the refusal_reason dictionary, nothing else. */
	isRefusalReason(reasonId: number, tx?: Tx): boolean {
		return (
			this.db(tx)
				.select({ id: dictItems.id })
				.from(dictItems)
				.where(
					and(
						eq(dictItems.id, reasonId),
						eq(dictItems.dict, 'refusal_reason'),
						eq(dictItems.isActive, true)
					)
				)
				.all().length > 0
		);
	}

	/** Guarded by the old status in the WHERE: a concurrent move of the same request changes nothing. */
	moveStatus(
		id: number,
		move: { from: RequestStatus; to: RequestStatus; stamp: StampField | undefined; at: Date },
		tx: Tx
	): boolean {
		const stamp = move.stamp ? { [move.stamp]: move.at } : {};
		return (
			this.db(tx)
				.update(requests)
				.set({ status: move.to, ...stamp })
				.where(and(eq(requests.id, id), eq(requests.status, move.from)))
				.run().changes > 0
		);
	}

	insertHistory(entry: HistoryEntry, tx: Tx): void {
		this.db(tx).insert(requestStatusHistory).values(entry).run();
	}

	private visibleWhere(ctx: ActorContext, scope: VisibilityScope, extra: SQL | undefined) {
		// Not correlated on purpose: drizzle renders the outer column unqualified inside a subquery.
		const crew =
			scope === 'assigned'
				? inArray(
						requests.id,
						this.db()
							.select({ requestId: requestAssignees.requestId })
							.from(requestAssignees)
							.where(eq(requestAssignees.userId, ctx.userId))
					)
				: undefined;
		const own = scope === 'own' ? eq(requests.createdById, ctx.userId) : undefined;
		return this.scopedWhere(
			ctx,
			(counterpartyId) => eq(requests.counterpartyId, counterpartyId),
			and(extra, crew, own)
		);
	}
}

/** `all`: whole counterparty or whole workshop; `own`: created by the actor; `assigned`: crew. */
export type VisibilityScope = 'all' | 'own' | 'assigned';
