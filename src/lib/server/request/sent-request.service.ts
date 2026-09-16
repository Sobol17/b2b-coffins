import { ForbiddenError, NotFoundError } from '../core/errors';
import type { Tx } from '../db/client';
import { PortalRequestService } from './portal-request.service';
import { RequestCardRepository, type CardRow } from './request-card.repository';
import type { ActorContext } from '$lib/types/actor';

/** Shared reach of the services that read or extend one sent request of the portal (P6). */
export abstract class SentRequestService extends PortalRequestService {
	protected constructor(
		ctx: ActorContext,
		protected readonly cards: RequestCardRepository = new RequestCardRepository()
	) {
		super(ctx);
	}

	/**
	 * @throws ForbiddenError for a request of another counterparty or of a colleague,
	 * NotFoundError when no sent request carries that id.
	 */
	protected reach(id: number, tx?: Tx): CardRow {
		const row = this.cards.findCard(this.ctx, id, !this.seesWholeCounterparty(), tx);
		if (row) return row;
		if (this.cards.exists(id, tx)) throw new ForbiddenError('request.read.own');
		throw new NotFoundError('request');
	}
}
