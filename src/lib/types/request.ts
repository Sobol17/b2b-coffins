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
