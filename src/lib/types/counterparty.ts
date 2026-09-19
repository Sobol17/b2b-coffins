import type { Page } from './list';
import type { PORTAL_ROLES } from './roles';

export type PortalRole = (typeof PORTAL_ROLES)[number];
export type SettlementScheme = 'on_fact' | 'weekly' | 'monthly';

/** Derived from the account, never stored: see StaffDtoMapper and the SQL filter next to it. */
export const STAFF_STATUSES = ['active', 'invited', 'disabled'] as const;
export type StaffStatus = (typeof STAFF_STATUSES)[number];

export interface ContactDto {
	readonly fullName: string;
	readonly phone: string | null;
	readonly email: string;
}

export interface StaffPreviewDto extends ContactDto {
	readonly role: PortalRole;
}

export interface ContractDto {
	readonly number: string;
	readonly signedAt: string | null;
	readonly validUntil: string | null;
}

/** What the portal shell needs on every page: whose portal it is and who to call. */
export interface CounterpartySummaryDto {
	readonly name: string;
	readonly manager: ContactDto | null;
}

/**
 * Counterparty card of the portal profile. Money goes to a role with prices only. Requisites and
 * the contract discount left the card in v1.33: the manager keeps them in the CRM card (C3).
 */
export interface CounterpartyCardDto {
	readonly id: number;
	readonly name: string;
	readonly contract: ContractDto | null;
	readonly manager: ContactDto | null;
	readonly staffPreview: readonly StaffPreviewDto[];
	readonly staffCount: number;
	readonly staffLimit: number;
	readonly debtMinor?: number;
	readonly yearPurchasesMinor?: number;
	readonly yearDeliveries?: number;
}

export interface StaffFilters {
	readonly role?: PortalRole | undefined;
	readonly status?: StaffStatus | undefined;
}

export interface StaffMemberDto {
	readonly id: number;
	readonly fullName: string;
	readonly email: string;
	readonly phone: string | null;
	readonly role: PortalRole;
	readonly status: StaffStatus;
	readonly lastLoginAt: string | null;
	/** The administrator's own row: the page does not offer to disable or demote it. */
	readonly isSelf: boolean;
}

export interface StaffPageDto extends Page<StaffMemberDto> {
	/** Active accounts count against the staff limit; disabled ones do not. */
	readonly activeCount: number;
	readonly staffLimit: number;
}

export interface CreatedStaffDto {
	readonly member: StaffMemberDto;
	/** Shown to the administrator once, so access survives a mail that did not arrive. */
	readonly temporaryPassword: string;
	readonly mailSent: boolean;
}
