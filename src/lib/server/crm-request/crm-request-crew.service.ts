import { ConflictError, ValidationError } from '../core/errors';
import type { Tx } from '../db/client';
import { CrmRequestBaseService } from './crm-request-base.service';
import { CrmRequestChoicesRepository } from './crm-request-choices.repository';
import { CrmRequestRepository, type SteeredRow } from './crm-request.repository';
import { ASSIGNEE_ROLE_TITLE, PRIORITY_TITLE } from '$lib/crm/requests/labels';
import { isLaunched, isSteerable } from '$lib/domain/request/amendment';
import type { ActorContext } from '$lib/types/actor';
import type { RequestPriority } from '$lib/types/request';
import type { AssigneeInput } from '$lib/validation/crm-request';

const CLOSED = 'Исполнителей и приоритет меняют до доставки заявки';

/** Crew and priority of a request (C4). After the launch every change leaves a history line. */
export class CrmRequestCrewService extends CrmRequestBaseService {
	constructor(
		ctx: ActorContext,
		requests: CrmRequestRepository = new CrmRequestRepository(),
		private readonly choices: CrmRequestChoicesRepository = new CrmRequestChoicesRepository()
	) {
		super(ctx, requests);
	}

	/**
	 * @throws ValidationError for a person without that role, ConflictError for a closed request or
	 * a second identical assignment, NotFoundError for an unknown request.
	 */
	assign(requestId: number, input: AssigneeInput): void {
		this.requireSteering();
		this.audited({ action: 'request.assign', entity: 'requests' }, (tx) => {
			const request = this.steerable(requestId, tx);
			if (!this.choices.crewRoles(input.userId, tx).includes(input.role)) {
				throw new ValidationError('Выберите сотрудника с этой ролью', { field: 'userId' });
			}
			if (!this.requests.insertAssignee(request.id, input.userId, input.role, tx)) {
				throw new ConflictError('Этот сотрудник уже назначен на заявку');
			}
			this.note(request, `Назначен исполнитель: ${this.who(request.id, input, tx)}`, tx);
			return { result: undefined, entityId: request.id, after: { ...input } };
		});
	}

	/** @throws ConflictError for the last assignee of a launched request or a closed request. */
	unassign(requestId: number, input: AssigneeInput): void {
		this.requireSteering();
		this.audited({ action: 'request.unassign', entity: 'requests' }, (tx) => {
			const request = this.steerable(requestId, tx);
			const who = this.who(request.id, input, tx);
			// Invariant 5 of tech.md 6.2 needs an assignee for the work; a launched request keeps one.
			if (isLaunched(request.status) && this.requests.crew(request.id, tx).length <= 1) {
				throw new ConflictError('У заявки в работе должен остаться исполнитель');
			}
			if (!this.requests.deleteAssignee(request.id, input.userId, input.role, tx)) {
				throw new ConflictError('Этот сотрудник не назначен на заявку');
			}
			this.note(request, `Снят исполнитель: ${who}`, tx);
			return { result: undefined, entityId: request.id, before: { ...input } };
		});
	}

	/** @throws ConflictError for a closed request, NotFoundError for an unknown one. */
	setPriority(requestId: number, priority: RequestPriority): void {
		this.requireSteering();
		this.audited({ action: 'request.priority', entity: 'requests' }, (tx) => {
			const request = this.steerable(requestId, tx);
			if (request.priority !== priority) {
				this.requests.setPriority(request.id, priority, tx);
				this.note(request, `Приоритет: ${PRIORITY_TITLE[priority]}`, tx);
			}
			return {
				result: undefined,
				entityId: request.id,
				before: { priority: request.priority },
				after: { priority }
			};
		});
	}

	private steerable(requestId: number, tx: Tx): SteeredRow {
		const request = this.requireRequest(requestId, tx);
		if (!isSteerable(request.status)) throw new ConflictError(CLOSED);
		return request;
	}

	private who(requestId: number, input: AssigneeInput, tx: Tx): string {
		const person = this.requests
			.crew(requestId, tx)
			.find((member) => member.userId === input.userId && member.role === input.role);
		return `${ASSIGNEE_ROLE_TITLE[input.role]}, ${person?.fullName ?? `#${input.userId}`}`;
	}

	private note(request: SteeredRow, comment: string, tx: Tx): void {
		if (isLaunched(request.status)) {
			this.requests.insertNote(request.id, request.status, this.ctx.userId, comment, tx);
		}
	}
}
