import { ForbiddenError, NotFoundError } from '../core/errors';
import type { Tx } from '../db/client';
import { CardDtoMapper } from './card.dto';
import { DraftItemRepository } from './draft-item.repository';
import { PortalRequestService } from './portal-request.service';
import { RequestCardRepository, type CardRow } from './request-card.repository';
import { targetsForRole } from '$lib/domain/request/state-machine';
import type { ActorContext } from '$lib/types/actor';
import type { RequestCardDto } from '$lib/types/request';

/** The request card behind `/portal/requests/[id]` (tech.md 14, P6). */
export class RequestCardService extends PortalRequestService {
	constructor(
		ctx: ActorContext,
		private readonly repo: RequestCardRepository = new RequestCardRepository(),
		private readonly lines: DraftItemRepository = new DraftItemRepository()
	) {
		super(ctx);
	}

	/**
	 * @throws ForbiddenError for a request of another counterparty or of a colleague,
	 * NotFoundError when no sent request carries that id.
	 */
	card(id: number): RequestCardDto {
		this.requireReader();
		const row = this.reach(id);
		const lines = this.lines.lines(row.id);
		const itemIds = lines.map((line) => line.id);
		return CardDtoMapper.toCard(row, {
			lines,
			options: this.lines.lineOptions(itemIds),
			prices: this.ctx.canSeePrices ? this.lines.linePrices(itemIds) : undefined,
			history: this.repo.history(row.id),
			comments: this.repo.comments(row.id),
			attachments: this.repo.attachments(row.id),
			// Buttons come from the state machine, so a screen cannot offer a move the server refuses.
			targets: targetsForRole(row.status, this.ctx.roles),
			viewerId: this.ctx.userId
		});
	}

	/** The same reach the card does, for the services that write to a request the actor can see. */
	protected reach(id: number, tx?: Tx): CardRow {
		const row = this.repo.findCard(this.ctx, id, !this.seesWholeCounterparty(), tx);
		if (row) return row;
		if (this.repo.exists(id, tx)) throw new ForbiddenError('request.read.own');
		throw new NotFoundError('request');
	}
}
