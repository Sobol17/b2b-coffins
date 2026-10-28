import { PolicyService } from '../auth/policy';
import { ConflictError, NotFoundError, ValidationError } from '../core/errors';
import { BaseService } from '../core/service';
import { CrmRequestRepository, type SteeredRow } from '../crm-request/crm-request.repository';
import type { Tx } from '../db/client';
import { bus } from '../events/bus';
import { RequestTransitionService } from '../request/request-transition.service';
import { OrgService } from '../settings/org.service';
import { paymentDay } from './payment-day';
import { PaymentMarkRepository } from './payment-mark.repository';
import { requestDebtMinor } from '$lib/domain/payment/debt';
import {
	acceptsPayment,
	isReversible,
	settledAmountMinor,
	type MarkRefusal
} from '$lib/domain/payment/mark';
import type { ActorContext } from '$lib/types/actor';
import type { RequestStatus, SubmittedRequestDto } from '$lib/types/request';
import type { PaymentMarkInput, PaymentReverseInput } from '$lib/validation/payment';

const REFUSAL: Readonly<Record<MarkRefusal, string>> = {
	nothing_due: 'Заявка уже оплачена полностью',
	overpayment: 'Сумма больше остатка к оплате'
};

/**
 * Payment marks of the request card (C7, tech.md v1.44). The manager never moves the status: a mark
 * that repays the last of the counterparty's debt lets the system take `awaiting_payment -> paid`
 * for all its covered requests in the same transaction (v1.65).
 */
export class PaymentMarkService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly marks: PaymentMarkRepository = new PaymentMarkRepository(),
		private readonly requests: CrmRequestRepository = new CrmRequestRepository(),
		private readonly transitions: RequestTransitionService = new RequestTransitionService(ctx),
		private readonly timeZone: string = OrgService.timezone(),
		private readonly now: () => Date = () => new Date()
	) {
		super(ctx);
		this.assert(
			ctx.scope === 'crm' && PolicyService.can(ctx, 'request.payment.mark'),
			'request.payment.mark'
		);
	}

	/**
	 * @throws NotFoundError for an unknown request, ConflictError for one that takes no money now,
	 * ValidationError for a date in the future or an amount above the rest.
	 */
	mark(requestId: number, input: PaymentMarkInput): SubmittedRequestDto {
		const paidAt = paymentDay(input.paidAt, this.timeZone, this.now());
		return this.audited({ action: 'payment.mark', entity: 'payment_marks' }, (tx) => {
			const request = this.waiting(requestId, tx);
			const dueMinor = requestDebtMinor(request.totalMinor, this.marks.amounts(request.id, tx));
			const verdict = settledAmountMinor(dueMinor, input.amountMinor);
			if (!verdict.ok) {
				throw new ValidationError(REFUSAL[verdict.refusal], { field: 'amountMinor' });
			}
			const markId = this.marks.insert(
				{
					requestId: request.id,
					amountMinor: verdict.amountMinor,
					paidAt,
					method: input.method,
					comment: input.comment,
					createdById: this.ctx.userId
				},
				tx
			);
			this.marks.syncPaid(request.id, tx);
			const status = this.settle(request, tx);
			// A closing mark is announced by request.paid; only a partial one needs its own event.
			if (status === 'awaiting_payment') bus.emit('request.payment_marked', request.id, tx);
			return {
				result: { id: request.id, number: request.number, status },
				entityId: markId,
				after: {
					requestId: request.id,
					amountMinor: verdict.amountMinor,
					method: input.method,
					paidAt: input.paidAt,
					status
				}
			};
		});
	}

	/**
	 * Cancels a mistaken mark with a row of the opposite sign; the mark itself stays as written.
	 * @throws NotFoundError for a mark of another request, ConflictError for a mark already
	 * cancelled, a reversal, or a request that is closed.
	 */
	reverse(requestId: number, input: PaymentReverseInput): void {
		this.audited({ action: 'payment.reverse', entity: 'payment_marks' }, (tx) => {
			const request = this.waiting(requestId, tx);
			const mark = this.marks.find(input.markId, tx);
			if (!mark || mark.requestId !== request.id) throw new NotFoundError('payment_mark');
			if (!isReversible(mark, request.status)) {
				throw new ConflictError('Эту отметку нельзя сторнировать');
			}
			const reversalId = this.marks.insert(
				{
					requestId: request.id,
					amountMinor: -mark.amountMinor,
					paidAt: mark.paidAt,
					method: mark.method,
					comment: input.comment,
					createdById: this.ctx.userId,
					reversalOfId: mark.id
				},
				tx
			);
			this.marks.syncPaid(request.id, tx);
			return {
				result: undefined,
				entityId: reversalId,
				before: { amountMinor: mark.amountMinor },
				after: { requestId: request.id, reversalOfId: mark.id, amountMinor: -mark.amountMinor }
			};
		});
	}

	private waiting(requestId: number, tx: Tx): SteeredRow {
		const request = this.requests.find(requestId, tx);
		if (!request) throw new NotFoundError('request');
		if (request.isStockRequest) throw new ConflictError('Заявку на склад не оплачивают');
		if (!acceptsPayment(request.status, request.isStockRequest)) {
			throw new ConflictError('Оплату отмечают у доставленной и ещё не оплаченной заявки');
		}
		return request;
	}

	/** A covered request waits for the rest of the counterparty's debt (tech.md v1.65). */
	private settle(request: SteeredRow, tx: Tx): RequestStatus {
		if (request.counterpartyId === null) return this.transitions.settle(request.id, tx);
		const closed = this.transitions.settleCounterparty(request.counterpartyId, tx);
		return closed.includes(request.id) ? 'paid' : 'awaiting_payment';
	}
}
