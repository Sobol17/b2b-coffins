import { PolicyService } from '../auth/policy';
import { NotFoundError, ValidationError } from '../core/errors';
import { BaseService } from '../core/service';
import { CrmCounterpartyRepository } from '../crm-counterparty/crm-counterparty.repository';
import { bus } from '../events/bus';
import { RequestTransitionService } from '../request/request-transition.service';
import { OrgService } from '../settings/org.service';
import { paymentDay } from './payment-day';
import { PaymentMarkRepository } from './payment-mark.repository';
import { allocatePayment } from '$lib/domain/payment/allocate';
import { requestDebtMinor } from '$lib/domain/payment/debt';
import type { MarkRefusal } from '$lib/domain/payment/mark';
import type { ActorContext } from '$lib/types/actor';
import type { CounterpartyPaymentResult } from '$lib/types/crm-counterparty';
import type { PaymentMarkInput } from '$lib/validation/payment';

const REFUSAL: Readonly<Record<MarkRefusal, string>> = {
	nothing_due: 'У контрагента нет долга к оплате',
	overpayment: 'Сумма больше долга контрагента'
};

/**
 * One payment against the whole debt of a counterparty (tech.md v1.65). The money is spread over
 * its waiting requests, the oldest delivery first, as ordinary marks of those requests. A request
 * closes only when the counterparty owes nothing at all: then they all move to `paid` together.
 */
export class CounterpartyPaymentService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly marks: PaymentMarkRepository = new PaymentMarkRepository(),
		private readonly counterparties: CrmCounterpartyRepository = new CrmCounterpartyRepository(),
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
	 * @throws NotFoundError for an unknown counterparty, ValidationError for a date in the future,
	 * a counterparty without debt or an amount above the debt.
	 */
	pay(counterpartyId: number, input: PaymentMarkInput): CounterpartyPaymentResult {
		const paidAt = paymentDay(input.paidAt, this.timeZone, this.now());
		return this.audited({ action: 'payment.counterparty', entity: 'counterparties' }, (tx) => {
			if (!this.counterparties.find(counterpartyId, tx)) throw new NotFoundError('counterparty');
			const open = this.marks.openOf(counterpartyId, tx).map((row) => ({
				requestId: row.requestId,
				dueMinor: requestDebtMinor(row.totalMinor, [row.paidMinor])
			}));
			const verdict = allocatePayment(open, input.amountMinor);
			if (!verdict.ok) {
				throw new ValidationError(REFUSAL[verdict.refusal], { field: 'amountMinor' });
			}
			for (const allocation of verdict.allocations) {
				this.marks.insert(
					{
						requestId: allocation.requestId,
						amountMinor: allocation.amountMinor,
						paidAt,
						method: input.method,
						comment: input.comment,
						createdById: this.ctx.userId
					},
					tx
				);
				this.marks.syncPaid(allocation.requestId, tx);
			}
			const closed = this.transitions.settleCounterparty(counterpartyId, tx);
			for (const { requestId } of verdict.allocations) {
				// A closing mark is announced by request.paid; a held one needs its own event.
				if (!closed.includes(requestId)) bus.emit('request.payment_marked', requestId, tx);
			}
			return {
				result: {
					amountMinor: verdict.amountMinor,
					requestCount: verdict.allocations.length,
					closedCount: closed.length
				},
				entityId: counterpartyId,
				after: {
					amountMinor: verdict.amountMinor,
					method: input.method,
					paidAt: input.paidAt,
					allocations: verdict.allocations.map((row) => ({ ...row })),
					closed
				}
			};
		});
	}
}
