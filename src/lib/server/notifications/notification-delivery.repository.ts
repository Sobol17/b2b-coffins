import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { countExpression } from '../core/list';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { notifications, requests, users } from '../db/schema';
import type { LogRow } from './notification.repository';
import { REQUEST_EVENT_KEYS } from '$lib/types/events';
import type { DeliveryFilters } from '$lib/validation/push';

export interface DeliveryRow extends LogRow {
	readonly userId: number;
	readonly userName: string;
	readonly error: string | null;
}

// Payload keeps ids only (tech.md 7.1); the entity id is read back through SQLite JSON functions.
const entityIdOf = sql<number>`json_extract(${notifications.payload}, '$.entityId')`;

/** Every channel row of every person: the owner's view of what the system sent (C15). */
export class NotificationDeliveryRepository extends BaseRepository<typeof notifications> {
	constructor() {
		super(notifications);
	}

	page(
		filters: DeliveryFilters,
		limit: number,
		offset: number,
		tx?: Tx
	): { rows: DeliveryRow[]; total: number } {
		const where = and(
			filters.eventKey === undefined ? undefined : eq(notifications.eventKey, filters.eventKey),
			filters.status === undefined ? undefined : eq(notifications.status, filters.status)
		);
		const rows = this.db(tx)
			.select({
				id: notifications.id,
				eventKey: notifications.eventKey,
				channel: notifications.channel,
				status: notifications.status,
				attempts: notifications.attempts,
				requestId: requests.id,
				requestNumber: requests.number,
				createdAt: notifications.createdAt,
				sentAt: notifications.sentAt,
				userId: users.id,
				userName: users.fullName,
				error: notifications.error
			})
			.from(notifications)
			.innerJoin(users, eq(users.id, notifications.userId))
			// Only a request event points at a request; the owner reads every counterparty.
			.leftJoin(
				requests,
				and(eq(requests.id, entityIdOf), inArray(notifications.eventKey, [...REQUEST_EVENT_KEYS]))
			)
			.where(where)
			.orderBy(desc(notifications.createdAt), desc(notifications.id))
			.limit(limit)
			.offset(offset)
			.all();
		const [count] = this.db(tx)
			.select({ total: countExpression })
			.from(notifications)
			.where(where)
			.all();
		return { rows, total: count?.total ?? 0 };
	}
}
