import type { RequestPriority } from './request';

/**
 * The shop floor, tech.md §8 (C5, v1.41). Work goes by position, not by request: a request is filled
 * from the stock the workshop has made. No money key lives here for any role.
 */

/** Requests in work shown at once; the number search reaches the rest. */
export const SHOP_REQUEST_LIMIT = 50;
/** Pieces in one production mark. */
export const SHOP_PRODUCE_MAX = 999;

/** A stock position of a product: the variant plus its colour. */
export interface ShopPositionDto {
	readonly variantId: number;
	readonly optionId: number | null;
	readonly productTitle: string;
	readonly sku: string;
	readonly sizeCode: string;
	readonly materialTitle: string;
	readonly colorTitle: string | null;
}

export interface ShopQueueRowDto extends ShopPositionDto {
	/** Pieces the requests in work still lack. */
	readonly neededQty: number;
	/** Balance of the position, never below zero. */
	readonly stockQty: number;
	readonly requestCount: number;
	readonly nearestDeliveryAt: string | null;
	readonly hasUrgent: boolean;
	/** False when the variant has no stock item: a mark would have nowhere to land. */
	readonly canProduce: boolean;
}

export interface ShopLineDto extends ShopPositionDto {
	readonly itemId: number;
	readonly qty: number;
	readonly filledQty: number;
}

export interface ShopRequestDto {
	readonly id: number;
	readonly number: string;
	readonly priority: RequestPriority;
	readonly isStockRequest: boolean;
	readonly counterpartyName: string | null;
	readonly deliveryAt: string | null;
	readonly unitCount: number;
	readonly filledCount: number;
	readonly lines: readonly ShopLineDto[];
	/** Every line filled: guard `stockCovered` of tech.md 6.2 holds. */
	readonly canAssemble: boolean;
}

export interface ShopDto {
	readonly queue: readonly ShopQueueRowDto[];
	readonly requests: readonly ShopRequestDto[];
	/** Requests in work matching the search, counted before the limit. */
	readonly requestTotal: number;
}
