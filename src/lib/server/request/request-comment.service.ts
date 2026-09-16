import { consumeRateLimit } from '../auth/rate-limit';
import { CardDtoMapper } from './card.dto';
import { RequestCardRepository } from './request-card.repository';
import { SentRequestService } from './sent-request.service';
import type { ActorContext } from '$lib/types/actor';
import type { RequestCommentDto } from '$lib/types/request';
import type { RequestCommentInput } from '$lib/validation/request';

/** The portal side of the thread with the manager (tech.md 14, P6). */
export class RequestCommentService extends SentRequestService {
	constructor(ctx: ActorContext, cards: RequestCardRepository = new RequestCardRepository()) {
		super(ctx, cards);
	}

	/**
	 * @throws ForbiddenError for a request the actor may not read, NotFoundError for a missing one,
	 * RateLimitError when the form is hammered.
	 */
	add(requestId: number, input: RequestCommentInput): RequestCommentDto {
		this.requireReader();
		consumeRateLimit('request.comment', String(this.ctx.userId));
		return this.audited({ action: 'request.comment', entity: 'comments' }, (tx) => {
			const request = this.reach(requestId, tx);
			const row = this.cards.insertComment(
				{ requestId: request.id, authorId: this.ctx.userId, body: input.body },
				tx
			);
			return {
				result: CardDtoMapper.toComment(row, this.ctx.userId),
				entityId: request.id,
				// The body stays out of the journal: the row itself is the record of what was said.
				after: { commentId: row.id }
			};
		});
	}
}
