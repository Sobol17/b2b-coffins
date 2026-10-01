import { PolicyService } from '../auth/policy';
import { CounterpartyDetailRepository } from '../crm-counterparty/counterparty-detail.repository';
import { CrmCounterpartyDtoMapper } from '../crm-counterparty/dto';
import { PaymentMarkRepository } from '../payment/payment-mark.repository';
import { DraftItemRepository } from '../request/draft-item.repository';
import { CardDtoMapper } from '../request/card.dto';
import { RequestCardRepository } from '../request/request-card.repository';
import { CrmRequestBaseService } from './crm-request-base.service';
import { CrmRequestChoicesRepository } from './crm-request-choices.repository';
import { CrmRequestRepository, type SteeredRow } from './crm-request.repository';
import { requestDebtMinor } from '$lib/domain/payment/debt';
import { acceptsPayment } from '$lib/domain/payment/mark';
import { itemsEditMode } from '$lib/domain/request/amendment';
import { attentionFlags } from '$lib/domain/request/attention';
import { targetsForRole } from '$lib/domain/request/state-machine';
import type { ActorContext } from '$lib/types/actor';
import type {
	AttentionFlag,
	CrmRequestCardDto,
	CrmRequestChoicesDto
} from '$lib/types/crm-request';
import type { DeliveryAddressDto } from '$lib/types/request';

/** The workshop card behind `/crm/requests/[id]` and the lists its forms pick from (C4). */
export class CrmRequestCardService extends CrmRequestBaseService {
	constructor(
		ctx: ActorContext,
		requests: CrmRequestRepository = new CrmRequestRepository(),
		private readonly cards: RequestCardRepository = new RequestCardRepository(),
		private readonly lines: DraftItemRepository = new DraftItemRepository(),
		private readonly choiceLists: CrmRequestChoicesRepository = new CrmRequestChoicesRepository(),
		private readonly addressBook: CounterpartyDetailRepository = new CounterpartyDetailRepository(),
		private readonly now: () => Date = () => new Date(),
		private readonly marks: PaymentMarkRepository = new PaymentMarkRepository()
	) {
		super(ctx, requests);
	}

	/** @throws NotFoundError for an unknown request or a draft of the cart. */
	card(id: number): CrmRequestCardDto {
		const request = this.requireRequest(id);
		// A workshop actor has no counterparty: the row-level rule lets every request through.
		const row = this.cards.findCard(this.ctx, request.id, false);
		if (!row) throw new Error(`request ${id} vanished between two reads`);
		const lines = this.lines.lines(request.id);
		const itemIds = lines.map((line) => line.id);
		return {
			...CardDtoMapper.toCore(row, {
				lines,
				options: this.lines.lineOptions(itemIds),
				prices: this.ctx.canSeePrices ? this.lines.linePrices(itemIds) : undefined,
				// The agency price is the counterparty's number for its own client, not the workshop's.
				agencyPrices: undefined,
				history: this.cards.history(request.id, true),
				attachments: this.cards.attachments(request.id),
				// Buttons come from the state machine, so a screen cannot offer a move the server refuses.
				targets: targetsForRole(request.status, this.ctx.roles)
			}),
			counterpartyId: request.counterpartyId,
			counterpartyName: request.counterpartyName,
			isStockRequest: request.isStockRequest,
			flags: this.flags(request),
			itemsEdit: itemsEditMode(request.status),
			...this.payments(request)
		};
	}

	/** The marks and the rest go out with the sums only, the same rule as every money key. */
	private payments(
		request: SteeredRow
	): Pick<CrmRequestCardDto, 'canMarkPayment' | 'payments' | 'dueMinor' | 'paidMinor'> {
		const canMarkPayment =
			PolicyService.can(this.ctx, 'request.payment.mark') &&
			acceptsPayment(request.status, request.isStockRequest);
		if (!this.ctx.canSeePrices) return { canMarkPayment };
		const rows = this.marks.ofRequest(request.id);
		const paid = rows.map((row) => row.amountMinor);
		return {
			canMarkPayment,
			payments: rows.map((row) => CrmCounterpartyDtoMapper.toPayment(row)),
			// Counted from the marks shown beside it, so the card cannot give two answers to one question.
			paidMinor: paid.reduce((sum, amount) => sum + amount, 0),
			dueMinor: request.isStockRequest ? 0 : requestDebtMinor(request.totalMinor, paid)
		};
	}

	private flags(request: SteeredRow): AttentionFlag[] {
		return attentionFlags(
			{
				status: request.status,
				deliveredAt: request.deliveredAt,
				scheme: request.isStockRequest ? null : request.scheme
			},
			this.now()
		);
	}

	choices(): CrmRequestChoicesDto {
		return this.choiceLists.choices();
	}

	/** Live delivery addresses of a counterparty, for the creation form; unknown gives none. */
	addresses(counterpartyId: number): DeliveryAddressDto[] {
		return this.addressBook
			.addresses(counterpartyId)
			.map(({ id, title, address, isDefault }) => ({ id, title, address, isDefault }));
	}
}
