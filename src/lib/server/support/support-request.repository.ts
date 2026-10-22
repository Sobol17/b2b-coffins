import { and, desc, eq, ne, type SQL } from 'drizzle-orm';
import { PolicyService } from '../auth/policy';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { requests } from '../db/schema';
import type { ActorContext } from '$lib/types/actor';
import type { SupportRequestOptionDto } from '$lib/types/support';

/** How many requests the select of a new thread offers: the newest ones are the ones asked about. */
const OPTIONS_LIMIT = 200;

/**
 * Requests a portal person may tie a thread to (tech.md 5.10). The select and the server check run
 * the same query, so a crafted id gets the same answer as a missing one.
 */
export class SupportRequestRepository extends BaseRepository<typeof requests> {
	constructor() {
		super(requests);
	}

	options(ctx: ActorContext): SupportRequestOptionDto[] {
		return this.select(ctx)
			.orderBy(desc(requests.submittedAt), desc(requests.id))
			.limit(OPTIONS_LIMIT)
			.all();
	}

	reachable(ctx: ActorContext, id: number, tx?: Tx): SupportRequestOptionDto | undefined {
		const [row] = this.select(ctx, tx, eq(requests.id, id)).all();
		return row;
	}

	private select(ctx: ActorContext, tx?: Tx, extra?: SQL) {
		const fence = this.scopedWhere(ctx, (counterpartyId) => {
			const counterparty = eq(requests.counterpartyId, counterpartyId);
			if (PolicyService.seesWholeCounterparty(ctx)) return counterparty;
			return and(counterparty, eq(requests.createdById, ctx.userId)) ?? counterparty;
		});
		return this.db(tx)
			.select({ id: requests.id, number: requests.number, status: requests.status })
			.from(requests)
			.where(and(fence, ne(requests.status, 'draft'), extra))
			.$dynamic();
	}
}
