import { PolicyService } from '../auth/policy';
import { DeliveryAddressRepository } from '../counterparty/delivery-address.repository';
import { NotFoundError } from '../core/errors';
import type { Tx } from '../db/client';
import { DraftCalculator } from './draft-calculator';
import { DraftItemRepository } from './draft-item.repository';
import { DraftWriter } from './draft-writer';
import { DraftRepository, type DraftRow } from './draft.repository';
import { PortalRequestService } from './portal-request.service';
import type { ActorContext } from '$lib/types/actor';
import type { DraftDto, DraftItemDto } from '$lib/types/request';
import type { AddDraftItemInput, DraftDetailsInput } from '$lib/validation/request';

/** The portal cart: the actor's own draft request (tech.md 14, P4). */
export class DraftService extends PortalRequestService {
	constructor(
		ctx: ActorContext,
		private readonly drafts: DraftRepository = new DraftRepository(),
		private readonly lines: DraftItemRepository = new DraftItemRepository(),
		private readonly addresses: DeliveryAddressRepository = new DeliveryAddressRepository(),
		private readonly writer: DraftWriter = new DraftWriter(ctx),
		private readonly calculator: DraftCalculator = new DraftCalculator(ctx)
	) {
		super(ctx);
	}

	/** @throws ForbiddenError for a role that cannot order. */
	current(): DraftDto | null {
		this.requireCreator();
		const draft = this.drafts.findDraft(this.ctx);
		return draft ? this.calculator.project(draft) : null;
	}

	/** Pieces in the draft, for the header chip. Zero for a role that cannot order. */
	unitCount(): number {
		if (!this.canOrder()) return 0;
		const draft = this.drafts.findDraft(this.ctx);
		return draft ? this.lines.lines(draft.id).reduce((sum, line) => sum + line.qty, 0) : 0;
	}

	/** Draft lines of one model, for the product page counter. Empty for a role that cannot order. */
	linesOf(productId: number): DraftItemDto[] {
		if (!this.canOrder()) return [];
		return (this.current()?.items ?? []).filter((item) => item.productId === productId);
	}

	/**
	 * Adds a line, or more pieces to the same line. The combination is checked here against the
	 * matrix, whatever the page allowed to pick.
	 * @throws NotFoundError for a variant the storefront does not offer, ValidationError for options.
	 */
	addItem(input: AddDraftItemInput): DraftDto {
		const counterpartyId = this.requireCreator();
		const optionIds = this.writer.checkedOptions(input.variantId, input.optionIds);
		this.audited({ action: 'request.draft_item_add', entity: 'requests' }, (tx) => {
			const draft = this.writer.openDraft(counterpartyId, tx);
			this.writer.putLine(
				draft.id,
				{ variantId: input.variantId, optionIds, qty: input.qty },
				false,
				tx
			);
			this.calculator.recalculate(draft.id, tx);
			return {
				result: draft.id,
				entityId: draft.id,
				after: { variantId: input.variantId, qty: input.qty }
			};
		});
		return this.projectedDraft();
	}

	setQty(itemId: number, qty: number): DraftDto {
		this.changeLine('request.draft_item_qty', itemId, (tx) => this.lines.setQty(itemId, qty, tx), {
			qty
		});
		return this.projectedDraft();
	}

	removeItem(itemId: number): DraftDto {
		this.changeLine('request.draft_item_remove', itemId, (tx) => this.lines.deleteLine(itemId, tx));
		return this.projectedDraft();
	}

	clear(): DraftDto | null {
		this.requireCreator();
		const draft = this.drafts.findDraft(this.ctx);
		if (!draft) return null;
		this.audited({ action: 'request.draft_clear', entity: 'requests' }, (tx) => {
			this.lines.clear(draft.id, tx);
			this.calculator.recalculate(draft.id, tx);
			return { result: undefined, entityId: draft.id };
		});
		return this.projectedDraft();
	}

	/** @throws NotFoundError without a draft or for an address of another counterparty. */
	saveDetails(details: DraftDetailsInput): DraftDto {
		this.requireCreator();
		this.audited({ action: 'request.draft_details', entity: 'requests' }, (tx) => {
			const draft = this.requireDraft(tx);
			if (
				details.deliveryAddressId !== null &&
				!this.addresses.findOwn(this.ctx, details.deliveryAddressId, tx)
			) {
				throw new NotFoundError('delivery address');
			}
			this.drafts.saveDetails(draft.id, details, tx);
			return {
				result: undefined,
				entityId: draft.id,
				after: { deliveryAddressId: details.deliveryAddressId }
			};
		});
		return this.projectedDraft();
	}

	// A read for a page that shows to other roles too: no draft is an answer, not an error.
	private canOrder(): boolean {
		return (
			PolicyService.can(this.ctx, 'request.create') &&
			this.ctx.scope === 'portal' &&
			this.ctx.counterpartyId !== null
		);
	}

	private requireDraft(tx?: Tx): DraftRow {
		const draft = this.drafts.findDraft(this.ctx, tx);
		if (!draft) throw new NotFoundError('draft');
		return draft;
	}

	private projectedDraft(): DraftDto {
		return this.calculator.project(this.requireDraft());
	}

	private changeLine(
		action: string,
		itemId: number,
		change: (tx: Tx) => void,
		after: Record<string, unknown> = {}
	): void {
		this.requireCreator();
		this.audited({ action, entity: 'requests' }, (tx) => {
			const draft = this.requireDraft(tx);
			// The item has to be a line of the actor's own draft: an id alone reaches nobody else's request.
			if (!this.lines.findLine(draft.id, itemId, tx)) throw new NotFoundError('draft item');
			change(tx);
			this.calculator.recalculate(draft.id, tx);
			return { result: undefined, entityId: draft.id, after: { itemId, ...after } };
		});
	}
}
