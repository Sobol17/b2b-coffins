import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import { countExpression } from '../core/list';
import type { Tx } from '../db/client';
import { counterparties, notifications, requests, roles, userRoles, users } from '../db/schema';
import type { ActorContext } from '$lib/types/actor';
import type { EventKey } from '$lib/types/events';
import type { NotificationChannel, NotificationStatus } from '$lib/types/notifications';
import type { RequestStatus } from '$lib/types/request';
import type { RoleCode } from '$lib/types/roles';

export interface RequestFacts {
	readonly id: number;
	readonly number: string;
	readonly status: RequestStatus;
	readonly counterpartyId: number | null;
	readonly counterpartyName: string | null;
	readonly createdById: number;
	readonly externalNumber: string | null;
}

export interface Person {
	readonly userId: number;
	readonly email: string;
	readonly roles: RoleCode[];
}

export interface DispatchRow {
	readonly id: number;
	readonly eventKey: EventKey;
	readonly channel: NotificationChannel;
	readonly status: NotificationStatus;
	readonly attempts: number;
	readonly entityId: number;
	readonly email: string;
}

export interface LogRow {
	readonly id: number;
	readonly eventKey: EventKey;
	readonly channel: NotificationChannel;
	readonly status: NotificationStatus;
	readonly attempts: number;
	readonly requestId: number | null;
	readonly requestNumber: string | null;
	readonly createdAt: Date;
	readonly sentAt: Date | null;
}

// Payload keeps ids only (tech.md 7.1); the entity id is read back through SQLite JSON functions.
const entityIdOf = sql<number>`json_extract(${notifications.payload}, '$.entityId')`;

export class NotificationRepository extends BaseRepository<typeof notifications> {
	constructor() {
		super(notifications);
	}

	requestFacts(requestId: number, tx?: Tx): RequestFacts | undefined {
		const [row] = this.db(tx)
			.select({
				id: requests.id,
				number: requests.number,
				status: requests.status,
				counterpartyId: requests.counterpartyId,
				counterpartyName: counterparties.name,
				createdById: requests.createdById,
				externalNumber: requests.externalNumber
			})
			.from(requests)
			.leftJoin(counterparties, eq(counterparties.id, requests.counterpartyId))
			.where(eq(requests.id, requestId))
			.all();
		return row;
	}

	/** Active, not deleted portal accounts of one counterparty with their roles. */
	portalPeople(counterpartyId: number, tx?: Tx): Person[] {
		const rows = this.db(tx)
			.select({ userId: users.id, email: users.email, role: roles.code })
			.from(users)
			.innerJoin(userRoles, eq(userRoles.userId, users.id))
			.innerJoin(roles, eq(roles.id, userRoles.roleId))
			.where(
				and(
					eq(users.counterpartyId, counterpartyId),
					eq(users.scope, 'portal'),
					eq(users.isActive, true),
					isNull(users.deletedAt)
				)
			)
			.orderBy(users.id)
			.all();
		const people = new Map<number, Person>();
		for (const row of rows) {
			const person = people.get(row.userId) ?? { userId: row.userId, email: row.email, roles: [] };
			person.roles.push(row.role);
			people.set(row.userId, person);
		}
		return [...people.values()];
	}

	/** The fanout rerun guard: one row per event, entity, person and channel. */
	exists(
		key: { eventKey: EventKey; entityId: number; userId: number; channel: NotificationChannel },
		tx?: Tx
	): boolean {
		const [row] = this.db(tx)
			.select({ id: notifications.id })
			.from(notifications)
			.where(
				and(
					eq(notifications.eventKey, key.eventKey),
					eq(notifications.userId, key.userId),
					eq(notifications.channel, key.channel),
					eq(entityIdOf, key.entityId)
				)
			)
			.limit(1)
			.all();
		return row !== undefined;
	}

	insert(
		row: { eventKey: EventKey; entityId: number; userId: number; channel: NotificationChannel },
		tx: Tx
	): number {
		const [created] = tx
			.insert(notifications)
			.values({
				eventKey: row.eventKey,
				userId: row.userId,
				channel: row.channel,
				payload: { entityId: row.entityId }
			})
			.returning({ id: notifications.id })
			.all();
		if (!created) throw new Error('notification insert returned no row');
		return created.id;
	}

	forDispatch(id: number, tx?: Tx): DispatchRow | undefined {
		const [row] = this.db(tx)
			.select({
				id: notifications.id,
				eventKey: notifications.eventKey,
				channel: notifications.channel,
				status: notifications.status,
				attempts: notifications.attempts,
				entityId: entityIdOf,
				email: users.email
			})
			.from(notifications)
			.innerJoin(users, eq(users.id, notifications.userId))
			.where(eq(notifications.id, id))
			.all();
		return row;
	}

	markSent(id: number, attempts: number, at: Date, tx?: Tx): void {
		this.db(tx)
			.update(notifications)
			.set({ status: 'sent', attempts, sentAt: at, error: null })
			.where(eq(notifications.id, id))
			.run();
	}

	markFailed(id: number, attempts: number, error: string, tx?: Tx): void {
		this.db(tx)
			.update(notifications)
			.set({ status: 'failed', attempts, error: error.slice(0, 500) })
			.where(eq(notifications.id, id))
			.run();
	}

	/** The actor's own delivery log, newest first, fenced by the counterparty like every portal read. */
	logPage(
		ctx: ActorContext,
		limit: number,
		offset: number,
		tx?: Tx
	): { rows: LogRow[]; total: number } {
		const where = this.scopedWhere(
			ctx,
			(counterpartyId) => eq(users.counterpartyId, counterpartyId),
			eq(notifications.userId, ctx.userId)
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
				sentAt: notifications.sentAt
			})
			.from(notifications)
			.innerJoin(users, eq(users.id, notifications.userId))
			.leftJoin(
				requests,
				and(eq(requests.id, entityIdOf), eq(requests.counterpartyId, users.counterpartyId))
			)
			.where(where)
			.orderBy(desc(notifications.createdAt), desc(notifications.id))
			.limit(limit)
			.offset(offset)
			.all();
		const [count] = this.db(tx)
			.select({ total: countExpression })
			.from(notifications)
			.innerJoin(users, eq(users.id, notifications.userId))
			.where(where)
			.all();
		return { rows, total: count?.total ?? 0 };
	}
}
