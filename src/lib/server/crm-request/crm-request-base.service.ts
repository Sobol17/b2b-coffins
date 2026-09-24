import { PolicyService } from '../auth/policy';
import { NotFoundError } from '../core/errors';
import { BaseService } from '../core/service';
import type { Tx } from '../db/client';
import { CrmRequestRepository, type SteeredRow } from './crm-request.repository';
import type { ActorContext } from '$lib/types/actor';

/**
 * Shared ground of the C4 services: the workshop contour and `request.read.any` (owner and manager)
 * are checked once here, before any method can run. The driver gets an own screen in C6.
 */
export abstract class CrmRequestBaseService extends BaseService {
	protected constructor(
		ctx: ActorContext,
		protected readonly requests: CrmRequestRepository = new CrmRequestRepository()
	) {
		super(ctx);
		this.assert(
			ctx.scope === 'crm' && PolicyService.can(ctx, 'request.read.any'),
			'request.read.any'
		);
	}

	/** Steering a request: its priority and lines (tech.md v1.40, assignees left in v1.42). */
	protected requireSteering(): void {
		this.assert(PolicyService.can(this.ctx, 'request.assign'), 'request.assign');
	}

	/** @throws NotFoundError for an unknown request or a draft still in the counterparty's cart. */
	protected requireRequest(id: number, tx?: Tx): SteeredRow {
		const row = this.requests.find(id, tx);
		if (!row) throw new NotFoundError('request');
		return row;
	}
}
