import type { StaffStatus } from './counterparty';
import type { DictCode } from './dicts';
import type { CRM_ROLES } from './roles';

/** Workshop accounts, dictionaries, settings and the audit journal of the CRM (C1). Owner only. */
export type CrmRole = (typeof CRM_ROLES)[number];

export interface CrmUserDto {
	readonly id: number;
	readonly fullName: string;
	readonly email: string;
	readonly phone: string | null;
	readonly roles: readonly CrmRole[];
	readonly status: StaffStatus;
	readonly lastLoginAt: string | null;
	readonly isSelf: boolean;
}

export interface CrmUserFilters {
	readonly role?: CrmRole | undefined;
	readonly status?: StaffStatus | undefined;
}

export interface CreatedCrmUserDto {
	readonly user: CrmUserDto;
	readonly temporaryPassword: string;
	readonly mailSent: boolean;
}

export interface DictItemDto {
	readonly id: number;
	readonly dict: DictCode;
	readonly code: string;
	readonly title: string;
	readonly sortOrder: number;
	readonly isActive: boolean;
}

export interface DictItemFilters {
	readonly dict: DictCode;
}

export interface AuditFilters {
	/** Part of the actor's name. */
	readonly actor?: string | undefined;
	readonly action?: string | undefined;
	readonly entity?: string | undefined;
	/** ISO dates, closed window over `createdAt` in the organisation timezone. */
	readonly from?: string | undefined;
	readonly to?: string | undefined;
}

export interface AuditEntryDto {
	readonly id: number;
	readonly createdAt: string;
	/** Null for a system entry. */
	readonly actorName: string | null;
	readonly action: string;
	readonly entity: string;
	readonly entityId: number | null;
	readonly before: Record<string, unknown> | null;
	readonly after: Record<string, unknown> | null;
	readonly ip: string | null;
}

export const NUMBERING_PERIODS = ['none', 'year', 'month'] as const;
export type NumberingPeriod = (typeof NUMBERING_PERIODS)[number];

export interface NumberingDto {
	readonly key: 'request';
	readonly prefix: string;
	readonly period: NumberingPeriod;
	/** The number the next request would get, so the owner sees the format before saving. */
	readonly nextPreview: string;
}

export interface OrgRequisitesDto {
	readonly name: string;
	readonly inn?: string;
	readonly kpp?: string;
	readonly address?: string;
	readonly phone?: string;
	readonly email?: string;
	readonly bank?: string;
	readonly bik?: string;
	readonly account?: string;
}

export interface CrmSettingsDto {
	readonly requisites: OrgRequisitesDto | null;
	readonly timezone: string;
	readonly numbering: NumberingDto;
	readonly charityRateBp: number | null;
	readonly charityFund: { readonly title: string; readonly url?: string } | null;
	readonly staffLimitDefault: number;
}
