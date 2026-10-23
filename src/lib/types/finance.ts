import type { ReportRangeDto, SalesBucket } from './crm-reports';
import type { Page } from './list';

// The owner's money page (C18, tech.md v1.58). Read and written by finance.manage only.
export const FINANCE_KINDS = ['income', 'expense'] as const;
export const FINANCE_SOURCES = [
	'order_payment',
	'manual_income',
	'payroll',
	'charity',
	'manual_expense'
] as const;
export const FINANCE_ENTRY_MAX_MINOR = 10_000_000_000; // 100 000 000 roubles
export const FINANCE_COMMENT_MAX = 500;
export type FinanceKind = (typeof FINANCE_KINDS)[number];
export type FinanceSource = (typeof FINANCE_SOURCES)[number];

/** Days are 'YYYY-MM-DD' in org.timezone, both inclusive. */
export interface FinanceFilters {
	from: string;
	to: string;
	kind: FinanceKind | null;
	source: FinanceSource | null;
}

/** One line of the feed. signedMinor is positive for money in, negative for money out. */
export interface FinanceOperationDto {
	key: string; // `${source}:${id}`, unique across sources
	source: FinanceSource;
	kind: FinanceKind;
	occurredOn: string;
	signedMinor: number;
	title: string;
	detail: string | null;
	href: string | null; // the source screen; null for a manual entry
	manualId: number | null; // set for a manual entry only: edit and delete use it
}

export interface FinanceSourceTotalDto {
	source: FinanceSource;
	signedMinor: number;
	count: number;
}

export interface FinanceBucketDto {
	from: string;
	to: string;
	incomeMinor: number;
	expenseMinor: number;
}

export interface FinanceSummaryDto {
	range: ReportRangeDto;
	incomeMinor: number;
	expenseMinor: number; // money out, net of reversals
	netMinor: number; // incomeMinor - expenseMinor
	bySource: FinanceSourceTotalDto[]; // all five sources, zeros included, in FINANCE_SOURCES order
	bucket: SalesBucket;
	buckets: FinanceBucketDto[]; // contiguous, empty buckets included
}

export interface FinancePageDto {
	filters: FinanceFilters;
	summary: FinanceSummaryDto;
	feed: Page<FinanceOperationDto>;
}
