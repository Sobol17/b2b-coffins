import type { StockMoveType } from './dicts';

/**
 * The warehouse, tech.md §8 (C8, v1.45). Balance is the sum of moves and every figure opens into
 * the moves it is made of. No money key lives here for any role.
 */

export const STOCK_KINDS = ['product', 'component'] as const;
export type StockKind = (typeof STOCK_KINDS)[number];

/** What the move form writes and what a reversal may cancel. */
export const MANUAL_MOVE_TYPES = ['purchase', 'adjustment'] as const;
export type ManualMoveType = (typeof MANUAL_MOVE_TYPES)[number];

export const INVENTORY_STATUSES = ['draft', 'applied'] as const;
export type InventoryStatus = (typeof INVENTORY_STATUSES)[number];

/** Units in one manual move or one inventory line. */
export const STOCK_MOVE_MAX = 100000;

export interface StockFilters {
	readonly kind?: StockKind | undefined;
	readonly belowThreshold?: boolean | undefined;
	readonly negative?: boolean | undefined;
	readonly activeOnly?: boolean | undefined;
}

export interface StockRowDto {
	readonly id: number;
	readonly kind: StockKind;
	readonly code: string;
	readonly title: string;
	readonly unitId: number;
	readonly unitTitle: string;
	readonly minThreshold: number;
	readonly isActive: boolean;
	/** Sum of every move of the item, all colours of a product together. */
	readonly balance: number;
	/** `minThreshold > 0` and the balance is under it. */
	readonly isBelowThreshold: boolean;
	/** Any position of the item is below zero. */
	readonly isNegative: boolean;
}

export interface StockPositionDto {
	readonly optionId: number | null;
	readonly colorTitle: string | null;
	readonly balance: number;
}

export interface StockMoveDto {
	readonly id: number;
	readonly occurredAt: string;
	readonly type: StockMoveType;
	readonly qty: number;
	readonly optionId: number | null;
	readonly colorTitle: string | null;
	readonly requestId: number | null;
	readonly requestNumber: string | null;
	readonly reasonTitle: string | null;
	readonly comment: string | null;
	readonly actorName: string | null;
	readonly reversalOfId: number | null;
	readonly isReversed: boolean;
	/** A manual move not yet reversed, and the actor holds `stock.manage`. */
	readonly canReverse: boolean;
	/** Exact figure of a consumption move in milli-units (tech.md v1.46), null elsewhere. */
	readonly consumedMilli: number | null;
}

/** The journal comes apart from the card as a page of `StockMoveDto`. */
export interface StockCardDto extends StockRowDto {
	/** One row for a component, a row per colour for a product. */
	readonly positions: readonly StockPositionDto[];
	/** Colours the move form offers: the matrix of the variant, empty for a component. */
	readonly colors: readonly { readonly id: number; readonly title: string }[];
	readonly canManage: boolean;
}

export interface StockChoicesDto {
	readonly units: readonly { readonly id: number; readonly title: string }[];
	readonly reasons: readonly { readonly id: number; readonly title: string }[];
}

export interface InventoryRowDto {
	readonly id: number;
	readonly kind: StockKind;
	readonly status: InventoryStatus;
	readonly comment: string | null;
	readonly createdByName: string;
	readonly createdAt: string;
	readonly appliedAt: string | null;
	readonly lineCount: number;
	/** Lines where the count differs from the books. */
	readonly diffCount: number;
}

export interface InventoryLineDto {
	readonly id: number;
	readonly stockItemId: number;
	readonly optionId: number | null;
	readonly code: string;
	readonly title: string;
	readonly colorTitle: string | null;
	readonly unitTitle: string;
	/** A draft shows the live balance, an applied inventory the figure frozen when it was applied. */
	readonly expectedQty: number;
	readonly actualQty: number;
}

export interface InventoryCardDto extends InventoryRowDto {
	readonly lines: readonly InventoryLineDto[];
	readonly canManage: boolean;
}
