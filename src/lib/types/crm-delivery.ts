import type { ShopPositionDto } from './crm-shop';
import type { RequestPriority } from './request';

/**
 * The delivery screen, tech.md §8 (C6, v1.43). The driver takes cash at the door, so an assembled
 * request carries its total and the rest to collect. Nothing else with money lives here.
 */

/** Requests per list; the nearest deadlines come first. */
export const DELIVERY_LIST_LIMIT = 50;

export interface DeliveryLineDto extends ShopPositionDto {
	readonly itemId: number;
	readonly qty: number;
	readonly loadedQty: number;
	/** Pieces the shelf holds for the rest of the line; 0 outside `ready`. */
	readonly loadableQty: number;
}

export interface DeliveryStopDto {
	readonly id: number;
	readonly number: string;
	readonly status: 'in_work' | 'ready';
	readonly priority: RequestPriority;
	readonly counterpartyName: string;
	readonly externalNumber: string | null;
	readonly deceasedName: string | null;
	readonly deliveryAt: string | null;
	readonly address: string | null;
	readonly contactName: string | null;
	readonly contactPhone: string | null;
	/** Yandex Maps: by coordinates, else by the address text. */
	readonly navigationUrl: string | null;
	readonly unitCount: number;
	readonly loadedCount: number;
	readonly lines: readonly DeliveryLineDto[];
	/** Every line loaded: guard `fullyLoaded` of tech.md 6.2 holds. */
	readonly canDeliver: boolean;
	/** `ready` only: the total of the request, what the cash checkbox records (no prepayment, v1.44). */
	readonly totalMinor?: number;
}

export interface DeliveryDto {
	readonly ready: readonly DeliveryStopDto[];
	readonly readyTotal: number;
	readonly planned: readonly DeliveryStopDto[];
	readonly plannedTotal: number;
}
