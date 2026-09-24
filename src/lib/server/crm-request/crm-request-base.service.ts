import { PolicyService } from '../auth/policy';
import { BaseService } from '../core/service';
import type { ActorContext } from '$lib/types/actor';

/**
 * Shared ground of the C4 services: the workshop contour and `request.read.any` (owner and manager)
 * are checked once here, before any method can run. The crew gets its own screens in C5 and C6.
 */
export abstract class CrmRequestBaseService extends BaseService {
	protected constructor(ctx: ActorContext) {
		super(ctx);
		this.assert(
			ctx.scope === 'crm' && PolicyService.can(ctx, 'request.read.any'),
			'request.read.any'
		);
	}

	/** Steering a request: its crew, priority and lines (tech.md v1.40). */
	protected requireSteering(): void {
		this.assert(PolicyService.can(this.ctx, 'request.assign'), 'request.assign');
	}
}
