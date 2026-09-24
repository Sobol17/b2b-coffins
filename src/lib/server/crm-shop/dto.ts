import type { ShopRequestRow, VariantTitleRow } from './shop.repository';
import {
	isCovered,
	positionKey,
	type DemandLine,
	type ProductionNeed
} from '$lib/domain/stock/allocation';
import type {
	ShopLineDto,
	ShopPositionDto,
	ShopQueueRowDto,
	ShopRequestDto
} from '$lib/types/crm-shop';

/** Names of the positions one screen shows, read once for the whole screen. */
export class PositionTitles {
	private readonly variants: ReadonlyMap<number, VariantTitleRow>;

	constructor(
		variants: readonly VariantTitleRow[],
		private readonly colours: ReadonlyMap<number, string>
	) {
		this.variants = new Map(variants.map((row) => [row.id, row]));
	}

	stockItemOf(variantId: number): number | null {
		return this.variants.get(variantId)?.stockItemId ?? null;
	}

	position(variantId: number, optionId: number | null): ShopPositionDto {
		const variant = this.variants.get(variantId);
		return {
			variantId,
			optionId,
			productTitle: variant?.productTitle ?? '',
			sku: variant?.sku ?? '',
			sizeCode: variant?.sizeCode ?? '',
			materialTitle: variant?.materialTitle ?? '',
			colorTitle: optionId === null ? null : (this.colours.get(optionId) ?? null)
		};
	}
}

/** Projection of the shop floor (tech.md v1.41). No money column is ever read for it. */
export class ShopDtoMapper {
	static toQueueRow(
		need: ProductionNeed,
		titles: PositionTitles,
		balances: ReadonlyMap<string, number>
	): ShopQueueRowDto {
		const stockItemId = titles.stockItemOf(need.variantId);
		const balance =
			stockItemId === null ? 0 : (balances.get(positionKey(stockItemId, need.optionId)) ?? 0);
		return {
			...titles.position(need.variantId, need.optionId),
			neededQty: need.neededQty,
			stockQty: Math.max(0, balance),
			requestCount: need.requestCount,
			nearestDeliveryAt: need.nearestDeliveryAt?.toISOString() ?? null,
			hasUrgent: need.hasUrgent,
			canProduce: stockItemId !== null
		};
	}

	static toRequest(
		row: ShopRequestRow,
		lines: readonly DemandLine[],
		filled: ReadonlyMap<number, number>,
		titles: PositionTitles
	): ShopRequestDto {
		const shown = lines.map((line) => ShopDtoMapper.toLine(line, filled, titles));
		const unitCount = shown.reduce((sum, line) => sum + line.qty, 0);
		const filledCount = shown.reduce((sum, line) => sum + line.filledQty, 0);
		return {
			id: row.id,
			number: row.number,
			priority: row.priority,
			isStockRequest: row.isStockRequest,
			counterpartyName: row.counterpartyName,
			deliveryAt: row.deliveryAt?.toISOString() ?? null,
			unitCount,
			filledCount,
			lines: shown,
			// The same rule as guard stockCovered, so the button never offers what the move refuses.
			canAssemble: isCovered(lines, filled)
		};
	}

	private static toLine(
		line: DemandLine,
		filled: ReadonlyMap<number, number>,
		titles: PositionTitles
	): ShopLineDto {
		return {
			...titles.position(line.variantId, line.optionId),
			itemId: line.itemId,
			qty: line.qty,
			filledQty: filled.get(line.itemId) ?? 0
		};
	}
}
