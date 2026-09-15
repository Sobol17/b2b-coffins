import { VariantRepository } from '../catalog/variant.repository';
import { DeliveryAddressRepository } from '../counterparty/delivery-address.repository';
import { NotFoundError, ValidationError } from '../core/errors';
import type { Tx } from '../db/client';
import { Numbering } from '../documents/numbering';
import { OrgService } from '../settings/org.service';
import { DraftItemRepository } from './draft-item.repository';
import { DraftRepository, type DraftRow } from './draft.repository';
import { checkOptionSelection, sameSelection } from '$lib/domain/request/item-options';
import type { ActorContext } from '$lib/types/actor';
import { MAX_LINE_QTY } from '$lib/validation/request';

export interface NewLine {
	readonly variantId: number;
	readonly optionIds: number[];
	readonly qty: number;
}

/**
 * Writes lines into the actor's draft for both the catalog and the repeat of a request. Rights are
 * checked by the calling service before it gets here.
 */
export class DraftWriter {
	constructor(
		private readonly ctx: ActorContext,
		private readonly drafts: DraftRepository = new DraftRepository(),
		private readonly lines: DraftItemRepository = new DraftItemRepository(),
		private readonly variants: VariantRepository = new VariantRepository(),
		private readonly addresses: DeliveryAddressRepository = new DeliveryAddressRepository(),
		private readonly numbering: Numbering = new Numbering()
	) {}

	/** The actor's draft, created with a number and the default address when there is none. */
	openDraft(counterpartyId: number, tx: Tx): DraftRow {
		const existing = this.drafts.findDraft(this.ctx, tx);
		if (existing) return existing;
		const number = this.numbering.next('request', new Date(), OrgService.timezone(), tx);
		const defaultAddress = this.addresses
			.listOwn(this.ctx, tx)
			.find((address) => address.isDefault);
		return this.drafts.createDraft(
			{
				number,
				counterpartyId,
				createdById: this.ctx.userId,
				deliveryAddressId: defaultAddress?.id ?? null
			},
			tx
		);
	}

	/**
	 * The option ids of a line, checked against the matrix of the variant.
	 * @throws NotFoundError for a variant the storefront does not offer, ValidationError for options.
	 */
	checkedOptions(variantId: number, optionIds: readonly number[]): number[] {
		if (!this.lines.findOrderableVariant(variantId)) throw new NotFoundError('variant');
		const check = checkOptionSelection(this.variants.findOptions([variantId]), optionIds);
		if (!check.ok) {
			throw new ValidationError('Такое сочетание опций недоступно для выбранного размера', {
				reason: check.reason,
				optionId: check.optionId
			});
		}
		return check.optionIds;
	}

	/** Same check, but undefined instead of an error for a position the storefront no longer offers. */
	availableOptions(variantId: number, optionIds: readonly number[]): number[] | undefined {
		try {
			return this.checkedOptions(variantId, optionIds);
		} catch (err) {
			if (err instanceof NotFoundError || err instanceof ValidationError) return undefined;
			throw err;
		}
	}

	/**
	 * Adds a line, or pieces to the line with the same variant and options. With `clamp` an overflow
	 * is cut to the line limit instead of refused: a repeat must not fail on an old large line.
	 * @throws ValidationError when the line would exceed the limit and `clamp` is off.
	 */
	putLine(draftId: number, line: NewLine, clamp: boolean, tx: Tx): void {
		const same = this.sameLine(draftId, line, tx);
		if (!same) {
			this.lines.insertLine(
				{ requestId: draftId, variantId: line.variantId, qty: Math.min(line.qty, MAX_LINE_QTY) },
				line.optionIds,
				tx
			);
			return;
		}
		const total = same.qty + line.qty;
		if (total > MAX_LINE_QTY && !clamp) {
			throw new ValidationError(`В одной строке не больше ${MAX_LINE_QTY} штук`, { field: 'qty' });
		}
		this.lines.setQty(same.id, Math.min(total, MAX_LINE_QTY), tx);
	}

	private sameLine(
		draftId: number,
		line: NewLine,
		tx: Tx
	): { id: number; qty: number } | undefined {
		const existing = this.lines.lines(draftId, tx);
		const options = this.lines.lineOptions(
			existing.map((row) => row.id),
			tx
		);
		return existing.find(
			(row) =>
				row.variantId === line.variantId &&
				sameSelection(
					options.filter((option) => option.itemId === row.id).map((option) => option.optionId),
					line.optionIds
				)
		);
	}
}
