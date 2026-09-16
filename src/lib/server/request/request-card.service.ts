import { CardDtoMapper } from './card.dto';
import { DraftItemRepository } from './draft-item.repository';
import { RequestCardRepository } from './request-card.repository';
import { SentRequestService } from './sent-request.service';
import { targetsForRole } from '$lib/domain/request/state-machine';
import type { ActorContext } from '$lib/types/actor';
import type { RequestCardDto } from '$lib/types/request';

/** The request card behind `/portal/requests/[id]` (tech.md 14, P6). */
export class RequestCardService extends SentRequestService {
	constructor(
		ctx: ActorContext,
		cards: RequestCardRepository = new RequestCardRepository(),
		private readonly lines: DraftItemRepository = new DraftItemRepository()
	) {
		super(ctx, cards);
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
			history: this.cards.history(row.id),
			comments: this.cards.comments(row.id),
			attachments: this.cards.attachments(row.id),
			// Buttons come from the state machine, so a screen cannot offer a move the server refuses.
			targets: targetsForRole(row.status, this.ctx.roles),
			viewerId: this.ctx.userId
		});
	}
}
