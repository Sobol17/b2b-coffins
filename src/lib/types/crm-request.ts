import type { RequestCardDto, RequestListItemDto, RequestPriority, RequestStatus } from './request';

/** Board, registry and card of the workshop, tech.md §8 (C4). Money keys only for a role with prices. */
export const BOARD_STATUSES = [
	'new',
	'in_work',
	'ready',
	'delivered',
	'awaiting_payment',
	'paid'
] as const satisfies readonly RequestStatus[];
export type BoardStatus = (typeof BOARD_STATUSES)[number];

export const BOARD_COLUMN_LIMIT = 50;
/** The paid column keeps the last week only: a closed request has nothing left to steer. */
export const BOARD_PAID_DAYS = 7;

/** Assignees left the system in v1.42, and with them the flag of a request without one. */
export const ATTENTION_FLAGS = ['payment_overdue'] as const;
export type AttentionFlag = (typeof ATTENTION_FLAGS)[number];

/** `total` is honoured for a role with prices only, like the portal registry. */
export const CRM_REQUEST_SORTS = ['submittedAt', 'number', 'deliveryAt', 'total'] as const;
export type CrmRequestSort = (typeof CRM_REQUEST_SORTS)[number];

export const CRM_REQUEST_EXPORT_LIMIT = 5000;

export interface CrmRequestFilters {
	/** Registry only: the board has a column per status. */
	readonly status?: RequestStatus | undefined;
	readonly counterpartyId?: number | undefined;
	readonly stockOnly?: boolean | undefined;
	readonly priority?: RequestPriority | undefined;
	readonly flag?: AttentionFlag | undefined;
	/** ISO dates of a closed window over `submittedAt`, read in the organisation timezone. */
	readonly from?: string | undefined;
	readonly to?: string | undefined;
}

export interface CrmRequestListItemDto extends RequestListItemDto {
	readonly counterpartyId: number | null;
	readonly isStockRequest: boolean;
	readonly deliveryAt: string | null;
	readonly flags: readonly AttentionFlag[];
}

export interface CrmBoardColumnDto {
	readonly status: BoardStatus;
	/** Counted over the whole filtered column, not over the cards shown. */
	readonly total: number;
	readonly cards: readonly CrmRequestListItemDto[];
}

export interface CrmBoardDto {
	readonly columns: readonly CrmBoardColumnDto[];
}

/**
 * `free` in `new`: the whole request is repriced; `controlled` in `in_work`: prices stay frozen and
 * every change needs a comment; `closed` later on.
 */
export const ITEMS_EDIT_MODES = ['free', 'controlled', 'closed'] as const;
export type ItemsEditMode = (typeof ITEMS_EDIT_MODES)[number];

export interface CrmRequestCardDto extends Omit<RequestCardDto, 'comments'> {
	readonly counterpartyId: number | null;
	readonly counterpartyName: string | null;
	readonly isStockRequest: boolean;
	readonly flags: readonly AttentionFlag[];
	readonly itemsEdit: ItemsEditMode;
}

export interface CrmRequestVariantChoice {
	readonly id: number;
	readonly sku: string;
	readonly productTitle: string;
	readonly sizeCode: string;
	readonly materialTitle: string;
	readonly options: readonly { readonly id: number; readonly title: string }[];
}

export interface CrmRequestChoicesDto {
	readonly counterparties: readonly { readonly id: number; readonly name: string }[];
	readonly variants: readonly CrmRequestVariantChoice[];
	readonly refusalReasons: readonly { readonly id: number; readonly title: string }[];
}

export interface CreatedCrmRequestDto {
	readonly id: number;
	readonly number: string;
}
