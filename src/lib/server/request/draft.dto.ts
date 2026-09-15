import type { DeliveryAddressRow } from '../counterparty/delivery-address.repository';
import type { DraftLineRow, LineOptionRow, LinePriceRow } from './draft-item.repository';
import type { DraftRow } from './draft.repository';
import type { RequestTotals } from '$lib/domain/request/pricing';
import type { DraftDto, DraftItemDto } from '$lib/types/request';
import { definedProps } from '$lib/utils/props';

export interface DraftParts {
	readonly lines: readonly DraftLineRow[];
	readonly options: readonly LineOptionRow[];
	readonly covers: ReadonlyMap<number, readonly number[]>;
	readonly addresses: readonly DeliveryAddressRow[];
	/** Undefined for a role without prices: the money columns were never read. */
	readonly prices: ReadonlyMap<number, LinePriceRow> | undefined;
	readonly totals: RequestTotals | undefined;
	readonly discountPercent: number | undefined;
}

/** Role projection of the cart (tech.md 8.1). */
export class DraftDtoMapper {
	static toDraft(draft: DraftRow, parts: DraftParts): DraftDto {
		return {
			id: draft.id,
			number: draft.number,
			items: parts.lines.map((line) => DraftDtoMapper.toItem(line, parts)),
			unitCount: parts.lines.reduce((sum, line) => sum + line.qty, 0),
			isPickup: draft.isPickup,
			deliveryAddressId: draft.deliveryAddressId,
			comment: draft.comment,
			externalNumber: draft.externalNumber,
			addresses: parts.addresses.map((address) => ({ ...address })),
			updatedAt: draft.updatedAt.toISOString(),
			...definedProps({
				itemsTotalMinor: parts.totals?.itemsTotalMinor,
				discountPercent: parts.totals === undefined ? undefined : parts.discountPercent,
				discountMinor: parts.totals?.discountMinor,
				totalMinor: parts.totals?.totalMinor
			})
		};
	}

	private static toItem(line: DraftLineRow, parts: DraftParts): DraftItemDto {
		const price = parts.prices?.get(line.id);
		return {
			id: line.id,
			productId: line.productId,
			productTitle: line.productTitle,
			sku: line.sku,
			sizeCode: line.sizeCode,
			materialTitle: line.materialTitle,
			coverMediaId: parts.covers.get(line.productId)?.[0] ?? null,
			qty: line.qty,
			options: parts.options
				.filter((option) => option.itemId === line.id)
				.map((option) => ({ id: option.optionId, kind: option.kind, title: option.title })),
			...definedProps({
				unitPriceMinor: price === undefined ? undefined : price.unitPriceMinor + price.optionsMinor,
				lineTotalMinor: price?.lineTotalMinor
			})
		};
	}
}
