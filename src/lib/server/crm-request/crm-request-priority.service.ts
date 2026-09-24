import { ConflictError } from '../core/errors';
import { CrmRequestBaseService } from './crm-request-base.service';
import { CrmRequestRepository } from './crm-request.repository';
import { PRIORITY_TITLE } from '$lib/crm/requests/labels';
import { isLaunched, isSteerable } from '$lib/domain/request/amendment';
import type { ActorContext } from '$lib/types/actor';
import type { RequestPriority } from '$lib/types/request';

/**
 * Priority of a request (C4). Assignees left the system in v1.42: everybody on the floor knows
 * the own zone. After the launch every change leaves a history line.
 */
export class CrmRequestPriorityService extends CrmRequestBaseService {
	constructor(ctx: ActorContext, requests: CrmRequestRepository = new CrmRequestRepository()) {
		super(ctx, requests);
	}

	/** @throws ConflictError for a closed request, NotFoundError for an unknown one. */
	setPriority(requestId: number, priority: RequestPriority): void {
		this.requireSteering();
		this.audited({ action: 'request.priority', entity: 'requests' }, (tx) => {
			const request = this.requireRequest(requestId, tx);
			if (!isSteerable(request.status)) {
				throw new ConflictError('Приоритет меняют до доставки заявки');
			}
			if (request.priority !== priority) {
				this.requests.setPriority(request.id, priority, tx);
				if (isLaunched(request.status)) {
					const note = `Приоритет: ${PRIORITY_TITLE[priority]}`;
					this.requests.insertNote(request.id, request.status, this.ctx.userId, note, tx);
				}
			}
			return {
				result: undefined,
				entityId: request.id,
				before: { priority: request.priority },
				after: { priority }
			};
		});
	}
}
