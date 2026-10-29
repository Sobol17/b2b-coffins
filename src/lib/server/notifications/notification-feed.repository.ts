import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { countExpression } from '../core/list';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import {
	notificationFeed,
	payrollPeriods,
	requests,
	shopTasks,
	stockItems,
	supportMessages,
	supportThreads,
	users
} from '../db/schema';
import type { ActorContext } from '$lib/types/actor';
import { REQUEST_EVENT_KEYS, type EventKey } from '$lib/types/events';

export interface FeedRow {
	readonly id: number;
	readonly eventKey: EventKey;
	readonly requestId: number | null;
	readonly requestNumber: string | null;
	readonly stockItemId: number | null;
	readonly stockItemTitle: string | null;
	readonly weekId: number | null;
	readonly weekStartsOn: Date | null;
	readonly supportThreadId: number | null;
	readonly supportSubject: string | null;
	readonly shopTaskId: number | null;
	readonly shopRequestNumber: string | null;
	readonly readAt: Date | null;
	readonly createdAt: Date;
}

const visitRequest = alias(requests, 'feed_visit_request');

const threadIdOfFeed = sql<number>`coalesce(${supportMessages.threadId}, case when ${notificationFeed.eventKey} in ('support.opened', 'support.closed') then ${notificationFeed.entityId} end)`;

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

	/**
	 * The actor's own rows, newest first, with what the event points at: a request, or for a
	 * workshop reader a stock item or a payroll week (v1.49).
	 */
	page(
		ctx: ActorContext,
		limit: number,
		offset: number,
		tx?: Tx
	): { rows: FeedRow[]; total: number } {
		const workshop = ctx.scope === 'crm';
		const never = sql`0`;
		const rows = this.db(tx)
			.select({
				id: notificationFeed.id,
				eventKey: notificationFeed.eventKey,
				requestId: requests.id,
				requestNumber: requests.number,
				stockItemId: stockItems.id,
				stockItemTitle: stockItems.title,
				weekId: payrollPeriods.id,
				weekStartsOn: payrollPeriods.startsOn,
				supportThreadId: supportThreads.id,
				supportSubject: supportThreads.subject,
				shopTaskId: shopTasks.id,
				shopRequestNumber: visitRequest.number,
				readAt: notificationFeed.readAt,
				createdAt: notificationFeed.createdAt
			})
			.from(notificationFeed)
			.innerJoin(users, eq(users.id, notificationFeed.userId))
			// Only a request event carries a request id. The workshop reads every request; a portal
			// reader stays inside the counterparty fence.
			.leftJoin(
				requests,
				and(
					eq(requests.id, notificationFeed.entityId),
					inArray(notificationFeed.eventKey, [...REQUEST_EVENT_KEYS]),
					workshop ? undefined : eq(requests.counterpartyId, users.counterpartyId)
				)
			)
			.leftJoin(
				stockItems,
				workshop
					? and(
							eq(stockItems.id, notificationFeed.entityId),
							eq(notificationFeed.eventKey, 'stock.below_threshold')
						)
					: never
			)
			.leftJoin(
				payrollPeriods,
				workshop
					? and(
							eq(payrollPeriods.id, notificationFeed.entityId),
							eq(notificationFeed.eventKey, 'payroll.week_closed')
						)
					: never
			)
			// A message event points at the message, the others at the thread (tech.md 7.3, v1.57).
			.leftJoin(
				supportMessages,
				and(
					eq(supportMessages.id, notificationFeed.entityId),
					eq(notificationFeed.eventKey, 'support.message_posted')
				)
			)
			.leftJoin(
				supportThreads,
				and(
					eq(supportThreads.id, threadIdOfFeed),
					workshop ? undefined : eq(supportThreads.counterpartyId, users.counterpartyId)
				)
			)
			// A visit is the workshop's: it names its request by number only (tech.md 7.3).
			.leftJoin(
				shopTasks,
				workshop
					? and(
							eq(shopTasks.id, notificationFeed.entityId),
							eq(notificationFeed.eventKey, 'shop.task_arrived')
						)
					: never
			)
			.leftJoin(visitRequest, eq(visitRequest.id, shopTasks.requestId))
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

	/** The feed belongs to one person; a portal read adds the counterparty fence on top. */
	private own(ctx: ActorContext) {
		return this.scopedWhere(
			ctx,
			(counterpartyId) => eq(users.counterpartyId, counterpartyId),
			eq(notificationFeed.userId, ctx.userId)
		);
	}
}
