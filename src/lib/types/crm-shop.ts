import type { RequestPriority } from './request';
import type { WorkRole } from './roles';

/**
 * The shop stations, tech.md §8 (C19). A visit is a request at a station; a job is the pieces of a
 * line there. No money key, no counterparty, no address and no deceased name for any role.
 */

/** Visits shown per station and list; the number search reaches the rest. */
export const SHOP_TASK_LIMIT = 50;
/** Pieces in one job, the line limit of the cart. */
export const SHOP_JOB_MAX = 999;

export interface ShopTaskListItemDto {
	readonly id: number;
	readonly requestId: number;
	readonly number: string;
	readonly station: WorkRole;
	readonly priority: RequestPriority;
	readonly isStockRequest: boolean;
	readonly deliveryAt: string | null;
	readonly takenAt: string | null;
	/** Pieces of the visit and pieces done at this station. */
	readonly unitCount: number;
	readonly doneCount: number;
}

export interface ShopStationDto {
	readonly station: WorkRole;
	/** Not taken yet, in station order (§20.4). */
	readonly fresh: readonly ShopTaskListItemDto[];
	readonly taken: readonly ShopTaskListItemDto[];
	/** Open visits of the station matching the search. */
	readonly total: number;
}

/** The actor's stations; manager and owner get all four. */
export interface ShopDto {
	readonly stations: readonly ShopStationDto[];
}

/** A stock position of a product: the variant plus its colour. Delivery reuses it. */
export interface ShopPositionDto {
	readonly variantId: number;
	readonly optionId: number | null;
	readonly productTitle: string;
	readonly sku: string;
	readonly sizeCode: string;
	readonly materialTitle: string;
	readonly colorTitle: string | null;
}

export interface ShopJobDto extends ShopPositionDto {
	readonly id: number;
	readonly itemId: number;
	readonly engraving: string | null;
	readonly comment: string | null;
	readonly qty: number;
	readonly doneQty: number;
}

export interface ShopTaskDto {
	readonly id: number;
	readonly requestId: number;
	readonly number: string;
	readonly station: WorkRole;
	readonly priority: RequestPriority;
	readonly isStockRequest: boolean;
	readonly deliveryAt: string | null;
	readonly comment: string | null;
	readonly takenAt: string | null;
	readonly takenByName: string | null;
	readonly completedAt: string | null;
	readonly jobs: readonly ShopJobDto[];
	/** Open and not taken. */
	readonly canTake: boolean;
	/** Open, has jobs, every job done to the piece. */
	readonly canComplete: boolean;
}

/** The shop side of a request line on the CRM card and of a card on the board. */
export interface CrmLineShopDto {
	readonly itemId: number;
	/** Pieces allocateStock gives the line now. */
	readonly fromStockQty: number;
	/** Open jobs, in shop order. */
	readonly stations: readonly { station: WorkRole; qty: number; doneQty: number }[];
	/** Pieces that passed the upholsterer. */
	readonly madeQty: number;
	/** Numbers of requests ahead in fillOrder that hold this position. */
	readonly heldBy: readonly string[];
}
