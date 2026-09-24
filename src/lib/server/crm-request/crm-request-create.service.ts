import { PolicyService } from '../auth/policy';
import { CounterpartyDetailRepository } from '../crm-counterparty/counterparty-detail.repository';
import { ForbiddenError, ValidationError } from '../core/errors';
import type { Tx } from '../db/client';
import { bus } from '../events/bus';
import { Numbering } from '../numbering/numbering';
import { DraftRepository } from '../request/draft.repository';
import { DraftWriter } from '../request/draft-writer';
import { RequestPricer } from '../request/request-pricer';
import { OrgService } from '../settings/org.service';
import { CrmRequestBaseService } from './crm-request-base.service';
import { CrmRequestChoicesRepository } from './crm-request-choices.repository';
import { CrmRequestRepository, type NewRequestValues } from './crm-request.repository';
import { isDeliveryFilled } from '$lib/domain/request/delivery';
import { checkTransition } from '$lib/domain/request/state-machine';
import { momentInZone } from '$lib/domain/time/zone';
import type { ActorContext } from '$lib/types/actor';
import type { CreatedCrmRequestDto } from '$lib/types/crm-request';
import type { CrmRequestCreateInput } from '$lib/validation/crm-request';

/** A request taken by phone or made for stock, entered by the workshop straight into `new` (C4). */
export class CrmRequestCreateService extends CrmRequestBaseService {
	constructor(
		ctx: ActorContext,
		requests: CrmRequestRepository = new CrmRequestRepository(),
		private readonly choices: CrmRequestChoicesRepository = new CrmRequestChoicesRepository(),
		private readonly addresses: CounterpartyDetailRepository = new CounterpartyDetailRepository(),
		private readonly drafts: DraftRepository = new DraftRepository(),
		private readonly writer: DraftWriter = new DraftWriter(ctx),
		private readonly pricer: RequestPricer = new RequestPricer(),
		private readonly numbering: Numbering = new Numbering(),
		private readonly timeZone: string = OrgService.timezone()
	) {
		super(ctx, requests);
	}

	/**
	 * Number, lines, prices, the send, the history line, the event and the audit row commit together.
	 * @throws ForbiddenError without `request.create`, ValidationError for a counterparty, an
	 * address, a deadline or a line the form cannot have, NotFoundError for a position not offered.
	 */
	create(input: CrmRequestCreateInput): CreatedCrmRequestDto {
		this.assert(PolicyService.can(this.ctx, 'request.create'), 'request.create');
		return this.audited({ action: 'request.create', entity: 'requests' }, (tx) => {
			const values = this.values(input, tx);
			this.assertSendable(values);
			const created = this.requests.insertDraft(values, tx);
			this.addLines(created.id, input.lines, tx);
			this.pricer.reprice(created.id, values.counterpartyId, tx);
			this.drafts.markSubmitted(created.id, new Date(), tx);
			this.drafts.insertHistory(
				{ requestId: created.id, fromStatus: 'draft', toStatus: 'new', actorId: this.ctx.userId },
				tx
			);
			bus.emit('request.submitted', created.id, tx);
			return {
				result: created,
				entityId: created.id,
				after: {
					status: 'new',
					kind: input.kind,
					counterpartyId: values.counterpartyId,
					lines: input.lines.length
				}
			};
		});
	}

	/** Same lines merge into one, like in the cart; a colour must belong to the size (tech.md 5.4). */
	private addLines(requestId: number, lines: CrmRequestCreateInput['lines'], tx: Tx): void {
		for (const line of lines) {
			const optionIds = this.writer.checkedOptions(
				line.variantId,
				line.optionId === null ? [] : [line.optionId]
			);
			this.writer.putLine(
				requestId,
				{ variantId: line.variantId, optionIds, qty: line.qty },
				false,
				tx
			);
		}
	}

	private values(input: CrmRequestCreateInput, tx: Tx): NewRequestValues {
		const common = {
			number: this.numbering.next('request', new Date(), this.timeZone, tx),
			createdById: this.ctx.userId,
			priority: input.priority,
			comment: input.comment
		};
		if (input.kind === 'stock') {
			return {
				...common,
				counterpartyId: null,
				deliveryAddressId: null,
				deliveryAt: null,
				deceasedName: null
			};
		}
		const counterpartyId = input.counterpartyId ?? 0;
		if (!this.choices.counterpartyExists(counterpartyId, tx)) {
			throw new ValidationError('Выберите контрагента', { field: 'counterpartyId' });
		}
		const addressId = input.deliveryAddressId ?? 0;
		if (!this.addresses.findAddress(counterpartyId, addressId, tx)) {
			throw new ValidationError('Выберите адрес этого контрагента', { field: 'deliveryAddressId' });
		}
		const deliveryAt = momentInZone(
			input.deliveryDate ?? '',
			input.deliveryTime ?? '',
			this.timeZone
		);
		if (deliveryAt === null) {
			throw new ValidationError('Укажите дату и время доставки', { field: 'deliveryDate' });
		}
		return {
			...common,
			counterpartyId,
			deliveryAddressId: addressId,
			deliveryAt,
			deceasedName: input.deceasedName
		};
	}

	/** The state machine decides whether the request may leave the draft (tech.md 6). */
	private assertSendable(values: NewRequestValues): void {
		const check = checkTransition({
			from: 'draft',
			to: 'new',
			actorRoles: this.ctx.roles,
			isOwnRequest: true,
			hasReason: false,
			guards: {
				deliveryFilled: isDeliveryFilled({
					isStockRequest: values.counterpartyId === null,
					deliveryAddressId: values.deliveryAddressId,
					deliveryAt: values.deliveryAt,
					deceasedName: values.deceasedName
				})
			}
		});
		if (!check.ok) {
			throw new ForbiddenError('request.create', { denial: check.denial.code });
		}
	}
}
