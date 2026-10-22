import { normalizeListQuery } from '../../../src/lib/server/core/list';
import type { Db } from '../../../src/lib/server/db/client';
import { supportMessages, supportThreads } from '../../../src/lib/server/db/schema';
import { SupportPostingService } from '../../../src/lib/server/support/support-posting.service';
import type { ActorContext } from '../../../src/lib/types/actor';
import type { ListQuery } from '../../../src/lib/types/list';
import type { SupportThreadDto, SupportThreadFilters } from '../../../src/lib/types/support';
import { insertUser } from './db';
import {
	portalActor,
	resetRequests,
	seedOrderingWorld,
	type OrderingWorld
} from './portal-requests';

export interface SupportWorld extends OrderingWorld {
	readonly managerId: number;
	readonly ownerId: number;
	readonly driverId: number;
}

/** The ordering world of P4 plus the workshop people who read and answer threads. */
export function supportWorld(db: Db): SupportWorld {
	return {
		...seedOrderingWorld(db),
		managerId: insertUser({
			email: 'manager@shop.example',
			role: 'manager',
			counterpartyId: null,
			fullName: 'Анна Мастерова'
		}),
		ownerId: insertUser({ email: 'owner@shop.example', role: 'owner', counterpartyId: null }),
		driverId: insertUser({ email: 'driver@shop.example', role: 'driver', counterpartyId: null })
	};
}

/** Threads point at requests, so they go first, then the request world of P4. */
export function resetSupport(db: Db): void {
	db.delete(supportMessages).run();
	db.delete(supportThreads).run();
	resetRequests(db);
}

export function crmActor(role: 'manager' | 'owner' | 'driver', userId: number): ActorContext {
	return portalActor(role, userId, null);
}

export function openThread(
	ctx: ActorContext,
	overrides: { subject?: string; body?: string; requestId?: number } = {}
): SupportThreadDto {
	return new SupportPostingService(ctx).open({
		subject: overrides.subject ?? 'Сроки по заявке',
		body: overrides.body ?? 'Успеете к пятнице?',
		...(overrides.requestId === undefined ? {} : { requestId: overrides.requestId })
	});
}

export function supportQuery(filters: SupportThreadFilters = {}): ListQuery<SupportThreadFilters> {
	return normalizeListQuery<SupportThreadFilters>({ filters });
}
