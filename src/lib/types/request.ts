import type { Page } from './list';
import type { RoleCode } from './roles';

export const REQUEST_STATUSES = [
	'draft',
	'new',
	'in_work',
	'ready',
	'delivered',
	'awaiting_payment',
	'paid',
	'cancelled',
	'rejected'
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_PRIORITIES = ['normal', 'urgent'] as const;
export type RequestPriority = (typeof REQUEST_PRIORITIES)[number];

export const GUARD_CODES = ['hasAssignee', 'pricesFixed', 'fullyPaid', 'deliveryFilled'] as const;
export type GuardCode = (typeof GUARD_CODES)[number];

export const EFFECT_CODES = [
	'audit',
	'consumeComponents',
	'produceStockItems',
	'shipStockItems',
	'freezeCharity',
	'emit:request.ready',
	'emit:request.delivered',
	'emit:request.paid'
] as const;
export type EffectCode = (typeof EFFECT_CODES)[number];

export interface Transition {
	readonly from: RequestStatus;
	readonly to: RequestStatus;
	readonly roles: readonly (RoleCode | 'system')[];
	readonly ownOnly?: boolean;
	readonly assignedOnly?: boolean;
	readonly requiresReason?: boolean;
	readonly auto?: boolean;
	readonly guards?: readonly GuardCode[];
	readonly effects?: readonly EffectCode[];
}

/**
 * Role-projected DTO. Price fields are optional by type, so a missing check fails at compile time.
 */
export interface RequestListItemDto {
	id: number;
	number: string;
	status: RequestStatus;
	priority: RequestPriority;
	counterpartyName: string | null;
	itemCount: number;
	unitCount: number;
	firstItemTitle: string | null;
	authorName: string | null;
	externalNumber: string | null;
	createdAt: string;
	submittedAt: string | null;
	readyAt: string | null;
	deliveredAt: string | null;
	totalMinor?: number;
	paidMinor?: number;
	charityAmountMinor?: number;
}

export interface DeliveryAddressDto {
	readonly id: number;
	readonly title: string;
	readonly address: string;
	readonly isDefault: boolean;
}

export interface DraftItemOptionDto {
	readonly id: number;
	readonly kind: string;
	readonly title: string;
}

/** A line of the portal draft (P4). Money keys only for a role with prices. */
export interface DraftItemDto {
	readonly id: number;
	readonly productId: number;
	/** Lets the product page find the line of the picked size and show its counter. */
	readonly variantId: number;
	readonly productTitle: string;
	readonly sku: string;
	readonly sizeCode: string;
	readonly materialTitle: string;
	readonly coverMediaId: number | null;
	readonly qty: number;
	readonly options: readonly DraftItemOptionDto[];
	/** Personal price of the variant plus the option surcharges, for one piece. */
	readonly unitPriceMinor?: number;
	readonly lineTotalMinor?: number;
	/** Agency price of the model, one piece. Display only: no draft sum reads it (P7). */
	readonly agencyUnitPriceMinor?: number;
}

/** The cart: the actor's own draft request with its delivery settings. */
export interface DraftDto {
	readonly id: number;
	readonly number: string;
	readonly items: readonly DraftItemDto[];
	readonly unitCount: number;
	readonly isPickup: boolean;
	readonly deliveryAddressId: number | null;
	readonly comment: string | null;
	readonly addresses: readonly DeliveryAddressDto[];
	readonly updatedAt: string;
	readonly itemsTotalMinor?: number;
	readonly discountPercent?: number;
	readonly discountMinor?: number;
	readonly totalMinor?: number;
}

export interface SubmittedRequestDto {
	readonly id: number;
	readonly number: string;
	readonly status: RequestStatus;
}

/** Summary of the last sent request, for the "repeat" panel of the portal home. */
export interface LastRequestDto {
	readonly id: number;
	readonly number: string;
	readonly submittedAt: string | null;
	readonly itemCount: number;
	readonly unitCount: number;
	readonly totalMinor?: number;
}

export const REQUEST_SORTS = ['submittedAt', 'number', 'total'] as const;
export type RequestSort = (typeof REQUEST_SORTS)[number];

/** Filters of the portal registry. An empty status list means every status the actor may see. */
export interface RequestFilters {
	readonly statuses?: readonly RequestStatus[];
	/** ISO dates of a closed window over `submittedAt`, read in the organisation timezone. */
	readonly from?: string;
	readonly to?: string;
}

export interface RequestListPageDto extends Page<RequestListItemDto> {
	/** Counted over the whole filtered set, not over the page: the chips show totals. */
	readonly countsByStatus: Readonly<Record<RequestStatus, number>>;
}

/** A line of a sent request (P6). Money keys only for a role with prices. */
export interface RequestItemDto {
	readonly id: number;
	readonly productId: number;
	readonly productTitle: string;
	readonly sku: string;
	readonly sizeCode: string;
	readonly materialTitle: string;
	readonly qty: number;
	readonly engraving: string | null;
	readonly comment: string | null;
	readonly options: readonly DraftItemOptionDto[];
	readonly unitPriceMinor?: number;
	readonly lineTotalMinor?: number;
	readonly agencyUnitPriceMinor?: number;
}

export interface RequestHistoryStepDto {
	readonly id: number;
	readonly fromStatus: RequestStatus | null;
	readonly toStatus: RequestStatus;
	/** Null for an automatic step: the system stands in for nobody (tech.md 6.2). */
	readonly actorName: string | null;
	readonly reasonTitle: string | null;
	readonly comment: string | null;
	readonly createdAt: string;
}

export interface RequestCommentDto {
	readonly id: number;
	readonly authorName: string;
	readonly isMine: boolean;
	readonly body: string;
	readonly createdAt: string;
}

export interface RequestAttachmentDto {
	readonly id: number;
	readonly name: string;
	readonly mime: string;
	readonly sizeBytes: number;
	readonly createdAt: string;
}

/** The request card of the portal. Money keys only for a role with prices. */
export interface RequestCardDto {
	readonly id: number;
	readonly number: string;
	readonly status: RequestStatus;
	readonly priority: RequestPriority;
	readonly createdAt: string;
	readonly submittedAt: string | null;
	readonly externalNumber: string | null;
	readonly comment: string | null;
	readonly authorName: string | null;
	readonly isPickup: boolean;
	readonly deliveryAddress: string | null;
	readonly items: readonly RequestItemDto[];
	readonly unitCount: number;
	readonly history: readonly RequestHistoryStepDto[];
	readonly comments: readonly RequestCommentDto[];
	readonly attachments: readonly RequestAttachmentDto[];
	/** Moves this actor may ask for, guards aside (tech.md 6.2). */
	readonly targets: readonly RequestStatus[];
	readonly itemsTotalMinor?: number;
	readonly discountPercent?: number;
	readonly discountMinor?: number;
	readonly totalMinor?: number;
	readonly paidMinor?: number;
	/** Frozen on delivery (P8); a role without prices never receives it. */
	readonly charityAmountMinor?: number;
}
