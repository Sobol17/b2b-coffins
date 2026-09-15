import { and, eq, isNull } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { users } from '../db/schema';
import type { ActorContext } from '$lib/types/actor';

export interface ProfileRow {
	readonly id: number;
	readonly email: string;
	readonly fullName: string;
	readonly phone: string | null;
}

export class ProfileRepository extends BaseRepository<typeof users> {
	constructor() {
		super(users);
	}

	/** The actor's own row, filtered by counterparty as every portal query is (tech.md 12). */
	findOwn(ctx: ActorContext, tx?: Tx): ProfileRow | undefined {
		const [row] = this.db(tx)
			.select({ id: users.id, email: users.email, fullName: users.fullName, phone: users.phone })
			.from(users)
			.where(
				this.scopedWhere(
					ctx,
					(counterpartyId) => eq(users.counterpartyId, counterpartyId),
					and(eq(users.id, ctx.userId), isNull(users.deletedAt))
				)
			)
			.all();
		return row;
	}

	updateContact(id: number, patch: { fullName: string; phone: string | null }, tx?: Tx): void {
		this.db(tx).update(users).set(patch).where(eq(users.id, id)).run();
	}
}
