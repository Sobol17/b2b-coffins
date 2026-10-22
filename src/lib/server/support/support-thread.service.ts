import { PolicyService } from '../auth/policy';
import { NotFoundError } from '../core/errors';
import { BaseService } from '../core/service';
import type { Tx } from '../db/client';
import { SupportDtoMapper } from './dto';
import { SupportMessageRepository } from './support-message.repository';
import { SupportRequestRepository } from './support-request.repository';
import { SupportThreadRepository, type SupportThreadRow } from './support-thread.repository';
import type { ActorContext } from '$lib/types/actor';
import type { ListQuery, Page } from '$lib/types/list';
import type {
	SupportRequestOptionDto,
	SupportThreadDto,
	SupportThreadFilters,
	SupportThreadListItemDto
} from '$lib/types/support';

export interface SupportDeps {
	readonly threads: SupportThreadRepository;
	readonly messages: SupportMessageRepository;
	readonly requests: SupportRequestRepository;
}

export function supportDeps(deps: Partial<SupportDeps> = {}): SupportDeps {
	return {
		threads: deps.threads ?? new SupportThreadRepository(),
		messages: deps.messages ?? new SupportMessageRepository(),
		requests: deps.requests ?? new SupportRequestRepository()
	};
}

/** Reads support threads for both contours (tech.md 5.10, v1.57). */
export class SupportThreadService extends BaseService {
	protected readonly deps: SupportDeps;

	constructor(ctx: ActorContext, deps: Partial<SupportDeps> = {}) {
		super(ctx);
		this.deps = supportDeps(deps);
	}

	list(query: ListQuery<SupportThreadFilters>): Page<SupportThreadListItemDto> {
		this.requireReader();
		const { rows, total } = this.deps.threads.page(this.ctx, query);
		return {
			rows: rows.map((row) => SupportDtoMapper.toListItem(row)),
			total,
			page: query.page,
			perPage: query.perPage
		};
	}

	/** @throws NotFoundError for a thread outside the actor's fence, the same as a missing one. */
	thread(id: number): SupportThreadDto {
		this.requireReader();
		const row = this.reach(id);
		return SupportDtoMapper.toThread(row, this.deps.messages.ofThread(row.id), this.ctx);
	}

	forRequest(requestId: number): SupportThreadListItemDto[] {
		this.requireReader();
		return this.deps.threads
			.forRequest(this.ctx, requestId)
			.map((row) => SupportDtoMapper.toListItem(row));
	}

	requestOptions(): SupportRequestOptionDto[] {
		this.assert(PolicyService.can(this.ctx, 'support.own'), 'support.own');
		return this.deps.requests.options(this.ctx);
	}

	counterpartyChoices(): { id: number; name: string }[] {
		this.assert(PolicyService.can(this.ctx, 'support.any'), 'support.any');
		return this.deps.threads.counterparties();
	}

	protected requireReader(): void {
		const allowed =
			PolicyService.can(this.ctx, 'support.own') || PolicyService.can(this.ctx, 'support.any');
		this.assert(allowed, 'support.own');
	}

	protected reach(id: number, tx?: Tx): SupportThreadRow {
		const row = this.deps.threads.find(this.ctx, id, tx);
		if (!row) throw new NotFoundError('support thread');
		return row;
	}
}
