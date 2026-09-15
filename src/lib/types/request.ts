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

export const GUARD_CODES = ['hasAssignee', 'pricesFixed', 'fullyPaid'] as const;
export type GuardCode = (typeof GUARD_CODES)[number];

export const EFFECT_CODES = [
	'audit',
	'consumeComponents',
	'produceStockItems',
	'shipStockItems',
	'freezeCharity',
	'reverseShipment',
	'emit:request.ready',
	'emit:request.delivered',
	'emit:request.delivery_failed',
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
	createdAt: string;
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
	readonly externalNumber: string | null;
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
