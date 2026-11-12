import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { requestItems, roles, userRoles, users } from '../db/schema';

/** Active drivers, with no account secrets or product prices in the projection. */
export class DeliveryDriverRepository extends BaseRepository<typeof users> {
	constructor() {
		super(users);
	}
	choices(tx?: Tx): { id: number; fullName: string }[] {
		return this.db(tx)
			.select({ id: users.id, fullName: users.fullName })
			.from(users)
			.innerJoin(userRoles, eq(userRoles.userId, users.id))
			.innerJoin(roles, eq(roles.id, userRoles.roleId))
			.where(
				and(
					eq(roles.code, 'driver'),
					eq(users.scope, 'crm'),
					eq(users.isActive, true),
					isNull(users.deletedAt)
				)
			)
			.orderBy(asc(users.fullName), asc(users.id))
			.all();
	}
	quantity(requestId: number, tx: Tx): number {
		return (
			this.db(tx)
				.select({ qty: sql<number>`coalesce(sum(${requestItems.qty}),0)` })
				.from(requestItems)
				.where(eq(requestItems.requestId, requestId))
				.get()?.qty ?? 0
		);
	}
}
