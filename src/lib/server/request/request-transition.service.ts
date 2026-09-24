import { PolicyService } from '../auth/policy';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../core/errors';
import { BaseService } from '../core/service';
import type { Tx } from '../db/client';
import { OutboxRequestEffects, type RequestEffects } from './request-effects';
import {
	RequestTransitionRepository,
	type TransitionRow,
	type VisibilityScope
} from './request-transition.repository';
import { evaluateGuards } from '$lib/domain/request/guards';
import {
	TRANSITIONS,
	checkTransition,
	type TransitionDenial
} from '$lib/domain/request/state-machine';
import { autoTransition, denialKind, stampFor } from '$lib/domain/request/transition-flow';
import type { ActorContext } from '$lib/types/actor';
import type { GuardCode, RequestStatus, SubmittedRequestDto, Transition } from '$lib/types/request';
import type { RequestTransitionInput } from '$lib/validation/request';

/** A refused guard in words, so the board says what to do instead of "not allowed" (v1.40). */
const GUARD_REFUSAL: Readonly<Record<GuardCode, string>> = {
	stockCovered: 'На складе не хватает позиций заявки',
	pricesFixed: 'У позиций заявки нет цены',
	fullyPaid: 'Заявка оплачена не полностью',
	deliveryFilled: 'Заполните адрес, срок доставки и ФИО умершего'
};

/**
 * Moves a sent request through tech.md 6.2. The state machine decides; this service gathers the
 * facts it asks for and commits the status, the history, the effects and the audit row together.
 */
export class RequestTransitionService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly repo: RequestTransitionRepository = new RequestTransitionRepository(),
		private readonly effects: RequestEffects = new OutboxRequestEffects()
	) {
		super(ctx);
	}

	/**
	 * @throws NotFoundError for a missing request, ForbiddenError for a foreign one or a move the
	 * actor has no right to, ConflictError for a move the status or a guard does not allow,
	 * ValidationError for a missing or unknown reason.
	 */
	move(requestId: number, input: RequestTransitionInput): SubmittedRequestDto {
		return this.audited({ action: 'request.transition', entity: 'requests' }, (tx) => {
			const request = this.reach(requestId, tx);
			const transition = this.check(request, input, tx);

			this.step(request.id, transition, this.ctx.userId, input, tx);
			const status = this.chainAutoSteps(request.id, transition.to, tx);

			return {
				result: { id: request.id, number: request.number, status },
				entityId: request.id,
				before: { status: request.status },
				after: { status, reasonId: input.reasonId }
			};
		});
	}

	private reach(requestId: number, tx: Tx): TransitionRow {
		const row = this.repo.findVisible(this.ctx, requestId, this.visibility(), tx);
		if (row) return row;
		if (this.repo.exists(requestId, tx)) throw new ForbiddenError('request.read');
		throw new NotFoundError('request');
	}

	private visibility(): VisibilityScope {
		if (this.ctx.scope === 'portal') return this.ctx.roles.includes('cp_admin') ? 'all' : 'own';
		return PolicyService.can(this.ctx, 'request.read.any') ? 'all' : 'assigned';
	}

	private check(request: TransitionRow, input: RequestTransitionInput, tx: Tx): Transition {
		if (input.reasonId !== null && !this.repo.isRefusalReason(input.reasonId, tx)) {
			throw new ValidationError('Причина не найдена в справочнике', { field: 'reasonId' });
		}
		const verdict = checkTransition({
			from: request.status,
			to: input.to,
			actorRoles: this.ctx.roles,
			isOwnRequest: this.ctx.scope === 'crm' || request.counterpartyId === this.ctx.counterpartyId,
			// A role that reads every request runs the workshop and stands in for any assignee.
			isAssigned:
				PolicyService.can(this.ctx, 'request.read.any') ||
				this.repo.isAssigned(request.id, this.ctx.userId, tx),
			hasReason: input.reasonId !== null,
			guards: evaluateGuards(this.repo.guardFacts(request.id, tx))
		});
		if (!verdict.ok) throw this.refusal(verdict.denial, request.status, input.to);
		return verdict.transition;
	}

	/**
	 * Automatic steps belong to the move that opened the way for them (tech.md 6.2, invariant 7), so
	 * they run here rather than in a job, and stop at the first guard that does not hold.
	 */
	private chainAutoSteps(requestId: number, from: RequestStatus, tx: Tx): RequestStatus {
		let status = from;
		// Bounded by the table: every step moves forward, so the chain cannot revisit a status.
		for (let taken = 0; taken < TRANSITIONS.length; taken += 1) {
			const step = this.nextAutoStep(requestId, status, tx);
			if (!step) return status;
			this.step(requestId, step, null, { reasonId: null, comment: null }, tx);
			status = step.to;
		}
		return status;
	}

	/** The system stands in for nobody: only the guards decide whether the step is taken. */
	private nextAutoStep(requestId: number, from: RequestStatus, tx: Tx): Transition | undefined {
		const candidate = autoTransition(from);
		if (!candidate) return undefined;

		const verdict = checkTransition({
			from,
			to: candidate.to,
			actorRoles: ['system'],
			isOwnRequest: true,
			isAssigned: true,
			hasReason: false,
			guards: evaluateGuards(this.repo.guardFacts(requestId, tx))
		});
		return verdict.ok ? verdict.transition : undefined;
	}

	private step(
		requestId: number,
		transition: Transition,
		actorId: number | null,
		note: Pick<RequestTransitionInput, 'reasonId' | 'comment'>,
		tx: Tx
	): void {
		const moved = this.repo.moveStatus(
			requestId,
			{ from: transition.from, to: transition.to, stamp: stampFor(transition.to), at: new Date() },
			tx
		);
		if (!moved) throw new ConflictError('Статус заявки уже изменился, обновите страницу');
		this.repo.insertHistory(
			{
				requestId,
				fromStatus: transition.from,
				toStatus: transition.to,
				actorId,
				reasonId: note.reasonId,
				comment: note.comment
			},
			tx
		);
		for (const effect of transition.effects ?? []) this.effects.apply(effect, requestId, tx);
	}

	private refusal(denial: TransitionDenial, from: RequestStatus, to: RequestStatus): Error {
		const meta = { denial: denial.code, from, to };
		switch (denialKind(denial)) {
			case 'conflict':
				return new ConflictError(
					denial.code === 'guard_failed'
						? GUARD_REFUSAL[denial.guard]
						: 'Переход недоступен для текущего статуса заявки',
					meta
				);
			case 'validation':
				return new ValidationError('Укажите причину', { ...meta, field: 'reasonId' });
			case 'forbidden':
				return new ForbiddenError('request.transition', meta);
		}
	}
}
