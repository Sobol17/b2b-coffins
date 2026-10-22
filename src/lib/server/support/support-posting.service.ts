import { PolicyService } from '../auth/policy';
import { consumeRateLimit } from '../auth/rate-limit';
import { ConflictError, NotFoundError } from '../core/errors';
import { withTransaction } from '../core/tx';
import { bus } from '../events/bus';
import { SupportDtoMapper } from './dto';
import { SupportThreadService, type SupportDeps } from './support-thread.service';
import type { ActorContext } from '$lib/types/actor';
import type { SupportMessageDto, SupportThreadDto } from '$lib/types/support';
import type { SupportOpenInput, SupportPostInput } from '$lib/validation/support';

const ENTITY = 'support_threads';

/** Opens, answers and closes support threads (tech.md 5.10, v1.57). */
export class SupportPostingService extends SupportThreadService {
	constructor(ctx: ActorContext, deps: Partial<SupportDeps> = {}) {
		super(ctx, deps);
	}

	/**
	 * Only the portal opens a thread. A request outside the P6 fence answers 404, like a missing one.
	 * @throws ForbiddenError, NotFoundError, RateLimitError
	 */
	open(input: SupportOpenInput): SupportThreadDto {
		this.assert(PolicyService.can(this.ctx, 'support.own'), 'support.own');
		const counterpartyId = this.ctx.counterpartyId;
		if (counterpartyId === null) throw new NotFoundError('counterparty');
		consumeRateLimit('support.post', String(this.ctx.userId));
		const id = this.audited({ action: 'support.open', entity: ENTITY }, (tx) => {
			const request =
				input.requestId === undefined
					? null
					: this.deps.requests.reachable(this.ctx, input.requestId, tx);
			if (request === undefined) throw new NotFoundError('request');
			const at = new Date();
			const threadId = this.deps.threads.insert(
				{
					counterpartyId,
					createdById: this.ctx.userId,
					requestId: request?.id ?? null,
					subject: input.subject,
					at
				},
				tx
			);
			const messageId = this.deps.messages.insert(
				{ threadId, authorId: this.ctx.userId, side: 'portal', body: input.body, at },
				tx
			);
			bus.emit('support.opened', threadId, tx);
			return {
				result: threadId,
				entityId: threadId,
				after: { threadId, messageId, requestId: request?.id ?? null }
			};
		});
		return this.thread(id);
	}

	/** @throws NotFoundError outside the fence, ConflictError for a closed thread, RateLimitError */
	post(threadId: number, input: SupportPostInput): SupportMessageDto {
		this.requireReader();
		consumeRateLimit('support.post', String(this.ctx.userId));
		const messageId = this.audited({ action: 'support.post', entity: ENTITY }, (tx) => {
			const thread = this.reach(threadId, tx);
			if (thread.status === 'closed') throw new ConflictError('Обращение закрыто');
			const at = new Date();
			const side = this.ctx.scope;
			const id = this.deps.messages.insert(
				{ threadId: thread.id, authorId: this.ctx.userId, side, body: input.body, at },
				tx
			);
			this.deps.threads.touch(thread.id, at, side, tx);
			bus.emit('support.message_posted', id, tx);
			return { result: id, entityId: thread.id, after: { threadId: thread.id, messageId: id } };
		});
		const row = this.deps.messages.find(messageId);
		if (!row) throw new NotFoundError('support message');
		return SupportDtoMapper.toMessage(row, this.ctx);
	}

	/** A second close is a no-op: no audit row and no event, the thread comes back as it is. */
	close(threadId: number): SupportThreadDto {
		this.requireReader();
		const closedNow = withTransaction((tx) => this.reach(threadId, tx).status === 'open');
		if (closedNow) {
			this.audited({ action: 'support.close', entity: ENTITY }, (tx) => {
				const changed = this.deps.threads.close(threadId, this.ctx.userId, new Date(), tx);
				if (changed) bus.emit('support.closed', threadId, tx);
				return { result: changed, entityId: threadId, after: { threadId } };
			});
		}
		return this.thread(threadId);
	}
}
