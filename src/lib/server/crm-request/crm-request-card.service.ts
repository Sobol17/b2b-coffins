import { CounterpartyDetailRepository } from '../crm-counterparty/counterparty-detail.repository';
import { DraftItemRepository } from '../request/draft-item.repository';
import { CardDtoMapper } from '../request/card.dto';
import { RequestCardRepository } from '../request/request-card.repository';
import { CrmRequestBaseService } from './crm-request-base.service';
import { CrmRequestChoicesRepository } from './crm-request-choices.repository';
import { CrmRequestRepository, type CrewRow, type SteeredRow } from './crm-request.repository';
import { CrmRequestDtoMapper } from './dto';
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
		private readonly now: () => Date = () => new Date()
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
		const crew = this.requests.crew(request.id);
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
			assignees: crew.map((member) => CrmRequestDtoMapper.toAssignee({ ...member, requestId: id })),
			flags: this.flags(request, crew),
			itemsEdit: itemsEditMode(request.status)
		};
	}

	private flags(request: SteeredRow, crew: readonly CrewRow[]): AttentionFlag[] {
		return attentionFlags(
			{
				status: request.status,
				assigneeRoles: crew.map((member) => member.role),
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
