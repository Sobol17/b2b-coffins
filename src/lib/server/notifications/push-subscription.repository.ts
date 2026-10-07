import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { pushSubscriptions, users } from '../db/schema';
import type { PushSubscriptionInput } from '$lib/validation/push';

export interface LiveSubscription {
	readonly id: number;
	readonly endpoint: string;
	readonly p256dh: string;
	readonly auth: string;
}

/** Devices that agreed to receive pushes (tech.md 17.3). One row per browser endpoint. */
export class PushSubscriptionRepository extends BaseRepository<typeof pushSubscriptions> {
	constructor() {
		super(pushSubscriptions);
	}

	/**
	 * The endpoint identifies the browser, not the person: whoever subscribes on it last owns it,
	 * so a shared phone never rings for the previous account.
	 */
	save(userId: number, input: PushSubscriptionInput, tx?: Tx): void {
		this.db(tx)
			.insert(pushSubscriptions)
			.values({ userId, ...input })
			.onConflictDoUpdate({
				target: pushSubscriptions.endpoint,
				set: { userId, p256dh: input.p256dh, auth: input.auth, expiredAt: null }
			})
			.run();
	}

	/** Devices of an active account that the push service still accepts. */
	liveOf(userId: number, tx?: Tx): LiveSubscription[] {
		return this.db(tx)
			.select({
				id: pushSubscriptions.id,
				endpoint: pushSubscriptions.endpoint,
				p256dh: pushSubscriptions.p256dh,
				auth: pushSubscriptions.auth
			})
			.from(pushSubscriptions)
			.innerJoin(users, eq(users.id, pushSubscriptions.userId))
			.where(
				and(
					eq(pushSubscriptions.userId, userId),
					isNull(pushSubscriptions.expiredAt),
					eq(users.isActive, true),
					isNull(users.deletedAt)
				)
			)
			.orderBy(pushSubscriptions.id)
			.all();
	}

	hasLive(userId: number, tx?: Tx): boolean {
		return this.liveOf(userId, tx).length > 0;
	}

	remove(userId: number, endpoint: string, tx?: Tx): boolean {
		const removed = this.db(tx)
			.delete(pushSubscriptions)
			.where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
			.run();
		return removed.changes > 0;
	}

	markExpired(id: number, at: Date, tx?: Tx): void {
		this.db(tx)
			.update(pushSubscriptions)
			.set({ expiredAt: at })
			.where(eq(pushSubscriptions.id, id))
			.run();
	}

	touch(id: number, at: Date, tx?: Tx): void {
		this.db(tx)
			.update(pushSubscriptions)
			.set({ lastUsedAt: at })
			.where(eq(pushSubscriptions.id, id))
			.run();
	}

	/** Deletes by condition, so a second run of the cleanup finds nothing. */
	purgeExpired(tx?: Tx): number {
		return this.db(tx).delete(pushSubscriptions).where(isNotNull(pushSubscriptions.expiredAt)).run()
			.changes;
	}
}
