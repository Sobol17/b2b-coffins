import type { RequestStatus } from './request';

// Counterparty questions to the workshop (tech.md 5.10, v1.57).
export const SUPPORT_THREAD_STATUSES = ['open', 'closed'] as const;
export type SupportThreadStatus = (typeof SUPPORT_THREAD_STATUSES)[number];

/** The contour a message came from: the counterparty or the workshop. */
export const SUPPORT_SIDES = ['portal', 'crm'] as const;
export type SupportSide = (typeof SUPPORT_SIDES)[number];

export const SUPPORT_SUBJECT_MIN = 3;
export const SUPPORT_SUBJECT_MAX = 120;
export const SUPPORT_BODY_MAX = 4000;
export const SUPPORT_EXCERPT_MAX = 100;

export interface SupportThreadListItemDto {
	id: number;
	subject: string;
	status: SupportThreadStatus;
	awaiting: SupportSide | null; // whose turn to answer; null when closed
	counterpartyName: string;
	authorName: string;
	requestId: number | null;
	requestNumber: string | null;
	lastMessageAt: string;
	createdAt: string;
}

export interface SupportMessageDto {
	id: number;
	side: SupportSide;
	authorName: string;
	authorRole: string;
	isMine: boolean;
	body: string;
	createdAt: string;
}

// No price on any support dto: a request is its number and status.
export interface SupportThreadDto extends SupportThreadListItemDto {
	counterpartyId: number;
	closedAt: string | null;
	closedByName: string | null;
	canPost: boolean;
	canClose: boolean;
	messages: SupportMessageDto[];
}

export interface SupportThreadFilters {
	status?: SupportThreadStatus;
	awaiting?: SupportSide;
	counterpartyId?: number;
	q?: string;
}

export interface SupportRequestOptionDto {
	id: number;
	number: string;
	status: RequestStatus;
}
