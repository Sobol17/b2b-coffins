import { PolicyService } from '../auth/policy';
import { ForbiddenError } from '../core/errors';
import { BaseService } from '../core/service';

/** Shared guards of the portal request services. */
export abstract class PortalRequestService extends BaseService {
	/** @returns the counterparty the request belongs to. */
	protected requireCreator(): number {
		this.assert(PolicyService.can(this.ctx, 'request.create'), 'request.create');
		// Workshop and stock requests are created in the CRM (C4); a portal draft always has a counterparty.
		if (this.ctx.scope !== 'portal' || this.ctx.counterpartyId === null) {
			throw new ForbiddenError('request.create');
		}
		return this.ctx.counterpartyId;
	}

	/** The administrator sees the requests of the whole counterparty, an employee only the own (P6). */
	protected seesWholeCounterparty(): boolean {
		return this.ctx.roles.includes('cp_admin');
	}
}
