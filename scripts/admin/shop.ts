import { and, asc, eq } from 'drizzle-orm';
import { withTransaction } from '../../src/lib/server/core/tx';
import { ShopDispatch } from '../../src/lib/server/crm-shop/shop-dispatch';
import type { Db } from '../../src/lib/server/db/client';
import { roles, userRoles, users } from '../../src/lib/server/db/schema';
import { RequestTransitionService } from '../../src/lib/server/request/request-transition.service';
import { actorContext } from './request';

/**
 * Runs the dispatch and the readiness of tech.md §20.4 once, so requests accepted before the
 * stations get their jobs. The owner stands behind it; a rerun on the same data writes nothing.
 */
export function shopSync(db: Db): { pieces: number; ready: number } {
	const [owner] = db
		.select({ email: users.email })
		.from(users)
		.innerJoin(userRoles, eq(userRoles.userId, users.id))
		.innerJoin(roles, eq(roles.id, userRoles.roleId))
		.where(and(eq(roles.code, 'owner'), eq(users.isActive, true)))
		.orderBy(asc(users.id))
		.limit(1)
		.all();
	if (!owner) throw new Error('no active owner: create one with user:create');
	const ctx = actorContext(db, owner.email);
	return withTransaction((tx) => {
		const { added } = new ShopDispatch().run(tx);
		const ready = new RequestTransitionService(ctx).settleWork(tx);
		return { pieces: added, ready: ready.length };
	});
}

export function shopSyncCommand(db: Db): void {
	const { pieces, ready } = shopSync(db);
	console.log(`Отправлено в цех: ${pieces} штук, заявок готово: ${ready}`);
}
