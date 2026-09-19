import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { countExpression } from '../core/list';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { notificationFeed, requests, users } from '../db/schema';
import type { ActorContext } from '$lib/types/actor';
import { REQUEST_EVENT_KEYS, type EventKey } from '$lib/types/events';

export interface FeedRow {
	readonly id: number;
	readonly eventKey: EventKey;
	readonly requestId: number | null;
	readonly requestNumber: string | null;
	readonly readAt: Date | null;
	readonly createdAt: Date;
}

/** The bell feed of tech.md 5.9: one row per person and event, read side of `notification.fanout`. */
export class NotificationFeedRepository extends BaseRepository<typeof notificationFeed> {
	constructor() {
		super(notificationFeed);
	}

	/**
	 * Writes the row of one addressee. The unique index of tech.md 5.9 carries the idempotency of
	 * the fanout job, so a rerun updates nothing and inserts nothing.
	 */
	insert(row: { userId: number; eventKey: EventKey; entityId: number }, tx: Tx): void {
		tx.insert(notificationFeed).values(row).onConflictDoNothing().run();
	}

	unreadCount(ctx: ActorContext, tx?: Tx): number {
		const [row] = this.db(tx)
			.select({ total: countExpression })
			.from(notificationFeed)
			.innerJoin(users, eq(users.id, notificationFeed.userId))
			.where(and(this.own(ctx), isNull(notificationFeed.readAt)))
			.all();
		return row?.total ?? 0;
	}

	/** The actor's own rows, newest first, with the request the event points at. */
	page(
		ctx: ActorContext,
		limit: number,
		offset: number,
		tx?: Tx
	): { rows: FeedRow[]; total: number } {
		const rows = this.db(tx)
			.select({
				id: notificationFeed.id,
				eventKey: notificationFeed.eventKey,
				requestId: requests.id,
				requestNumber: requests.number,
				readAt: notificationFeed.readAt,
				createdAt: notificationFeed.createdAt
			})
			.from(notificationFeed)
			.innerJoin(users, eq(users.id, notificationFeed.userId))
			// Only a request event carries a request id; a stock or payroll row points elsewhere.
			.leftJoin(
				requests,
				and(
					eq(requests.id, notificationFeed.entityId),
					inArray(notificationFeed.eventKey, [...REQUEST_EVENT_KEYS]),
					eq(requests.counterpartyId, users.counterpartyId)
				)
			)
			.where(this.own(ctx))
			.orderBy(desc(notificationFeed.createdAt), desc(notificationFeed.id))
			.limit(limit)
			.offset(offset)
			.all();
		const [count] = this.db(tx)
			.select({ total: countExpression })
			.from(notificationFeed)
			.innerJoin(users, eq(users.id, notificationFeed.userId))
			.where(this.own(ctx))
			.all();
		return { rows, total: count?.total ?? 0 };
	}

	/** Marks the listed rows of the actor read. A row of somebody else stays untouched. */
	markRead(ctx: ActorContext, ids: readonly number[], at: Date, tx?: Tx): void {
		if (ids.length === 0) return;
		this.db(tx)
			.update(notificationFeed)
			.set({ readAt: at })
			.where(
				and(
					eq(notificationFeed.userId, ctx.userId),
					isNull(notificationFeed.readAt),
					inArray(notificationFeed.id, [...ids])
				)
			)
			.run();
	}

	/** The feed belongs to one person, inside the counterparty fence of every portal read. */
	private own(ctx: ActorContext) {
		return this.scopedWhere(
			ctx,
			(counterpartyId) => eq(users.counterpartyId, counterpartyId),
			eq(notificationFeed.userId, ctx.userId)
		);
	}
}
