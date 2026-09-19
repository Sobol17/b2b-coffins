import { consumeRateLimit } from '../auth/rate-limit';
import { DeliveryAddressRepository } from '../counterparty/delivery-address.repository';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../core/errors';
import type { Tx } from '../db/client';
import { bus } from '../events/bus';
import { DraftCalculator } from './draft-calculator';
import { DraftItemRepository } from './draft-item.repository';
import { DraftRepository, type DraftRow } from './draft.repository';
import { PortalRequestService } from './portal-request.service';
import { isDeliveryFilled } from '$lib/domain/request/delivery';
import { checkTransition } from '$lib/domain/request/state-machine';
import type { ActorContext } from '$lib/types/actor';
import type { SubmittedRequestDto } from '$lib/types/request';
import type { DraftDetailsInput } from '$lib/validation/request';

/** Sends the portal draft to the workshop: `draft -> new` (tech.md 6.2). */
export class RequestSubmitService extends PortalRequestService {
	constructor(
		ctx: ActorContext,
		private readonly drafts: DraftRepository = new DraftRepository(),
		private readonly lines: DraftItemRepository = new DraftItemRepository(),
		private readonly addresses: DeliveryAddressRepository = new DeliveryAddressRepository(),
		private readonly calculator: DraftCalculator = new DraftCalculator(ctx)
	) {
		super(ctx);
	}

	/**
	 * Details, the price snapshot, the status, the history line, the event and the audit row commit
	 * together: a failed send leaves the draft exactly as it was.
	 * @throws ConflictError without a draft or lines, ValidationError without a delivery choice or
	 * with a position no longer offered, RateLimitError when sent too often.
	 */
	submit(details: DraftDetailsInput): SubmittedRequestDto {
		this.requireCreator();
		consumeRateLimit('request.submit', String(this.ctx.userId));

		return this.audited({ action: 'request.submit', entity: 'requests' }, (tx) => {
			const draft = this.drafts.findDraft(this.ctx, tx);
			if (!draft) throw new ConflictError('Черновика нет: заявка уже отправлена');
			this.assertDelivery(details, tx);
			this.assertOrderable(draft.id, tx);
			this.assertTransition(draft, details);

			this.drafts.saveDetails(draft.id, details, tx);
			this.calculator.recalculate(draft.id, tx);
			if (!this.drafts.markSubmitted(draft.id, new Date(), tx)) {
				throw new ConflictError('Заявка уже отправлена');
			}
			this.drafts.insertHistory(
				{ requestId: draft.id, fromStatus: 'draft', toStatus: 'new', actorId: this.ctx.userId },
				tx
			);
			bus.emit('request.submitted', draft.id, tx);

			return {
				result: { id: draft.id, number: draft.number, status: 'new' as const },
				entityId: draft.id,
				before: { status: 'draft' },
				after: { status: 'new' }
			};
		});
	}

	/** The guard of tech.md 6.2 says yes or no; these messages say which field to go back to. */
	private assertDelivery(details: DraftDetailsInput, tx: Tx): void {
		if (details.deliveryAddressId === null) {
			throw new ValidationError('Выберите адрес доставки', { field: 'deliveryAddressId' });
		}
		if (details.deliveryAt === null) {
			throw new ValidationError('Укажите дату и время доставки', { field: 'deliveryDate' });
		}
		if ((details.deceasedName ?? '').trim() === '') {
			throw new ValidationError('Укажите ФИО умершего', { field: 'deceasedName' });
		}
		if (!this.addresses.findOwn(this.ctx, details.deliveryAddressId, tx)) {
			throw new NotFoundError('delivery address');
		}
	}

	private assertOrderable(draftId: number, tx: Tx): void {
		const lines = this.lines.lines(draftId, tx);
		if (lines.length === 0) throw new ConflictError('В заявке нет позиций');
		const gone = lines.find((line) => !this.lines.findOrderableVariant(line.variantId, tx));
		if (gone) {
			throw new ValidationError(`Позиция ${gone.sku} больше недоступна, удалите её из заявки`, {
				itemId: gone.id
			});
		}
	}

	/** The state machine decides, not this service (tech.md 6). */
	private assertTransition(draft: DraftRow, details: DraftDetailsInput): void {
		const check = checkTransition({
			from: 'draft',
			to: 'new',
			actorRoles: this.ctx.roles,
			isOwnRequest: draft.createdById === this.ctx.userId,
			isAssigned: false,
			hasReason: false,
			// The details are not written yet, so the guard reads what is about to be written.
			guards: {
				deliveryFilled: isDeliveryFilled({
					isStockRequest: false,
					deliveryAddressId: details.deliveryAddressId,
					deliveryAt: details.deliveryAt,
					deceasedName: details.deceasedName
				})
			}
		});
		if (!check.ok) throw new ForbiddenError('request.submit', { denial: check.denial.code });
	}
}
