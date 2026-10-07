import type { StockKind } from './crm-stock';
import type { Page } from './list';
import type { RequestStatus } from './request';

export const REPORT_MAX_DAYS = 366;
export const REPORT_PRESETS = ['week', 'month', 'quarter', 'year'] as const;
export const SALES_GROUPS = ['counterparty', 'model', 'period'] as const;
export const SALES_BUCKETS = ['day', 'week', 'month'] as const;
export const LOST_STATUSES = ['cancelled', 'rejected'] as const;
export const FUNNEL_STAGES = ['new', 'in_work', 'ready', 'delivered', 'paid'] as const;
export const CHARITY_TRANSFER_MAX_MINOR = 10_000_000_000; // 100 000 000 roubles
export type ReportPreset = (typeof REPORT_PRESETS)[number];
export type SalesGroup = (typeof SALES_GROUPS)[number];
export type SalesBucket = (typeof SALES_BUCKETS)[number];
export type LostStatus = (typeof LOST_STATUSES)[number];
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

/** 'YYYY-MM-DD' in org.timezone, both inclusive. */
export interface ReportRangeDto {
	from: string;
	to: string;
}

export interface SalesTotalsDto {
	requestCount: number;
	qty: number;
	itemsTotalMinor: number;
	discountMinor: number;
	totalMinor: number;
	paidMinor: number; // paid so far on these requests
}
export interface SalesByCounterpartyRowDto extends SalesTotalsDto {
	counterpartyId: number;
	title: string;
}
export interface SalesByModelRowDto {
	modelId: number;
	title: string;
	requestCount: number;
	qty: number;
	linesTotalMinor: number; // sum of line totals, before the request discount
}
export interface SalesByPeriodRowDto extends SalesTotalsDto {
	bucketFrom: string;
	bucketTo: string;
}
export type SalesRowsDto =
	| { group: 'counterparty'; rows: SalesByCounterpartyRowDto[] }
	| { group: 'model'; rows: SalesByModelRowDto[] }
	| { group: 'period'; bucket: SalesBucket; rows: SalesByPeriodRowDto[] };
export type SalesReportDto = SalesRowsDto & {
	range: ReportRangeDto;
	counterpartyId: number | null;
	totals: SalesTotalsDto;
};

export interface StockTurnoverRowDto {
	stockItemId: number;
	optionId: number | null;
	code: string;
	title: string;
	optionTitle: string | null;
	unitTitle: string;
	openingQty: number;
	incomeQty: number;
	outcomeQty: number;
	closingQty: number;
	shippedQty: number; // shipments net of their reversals
	turnoverDays: number | null; // null when nothing was shipped
}
export interface StockTurnoverReportDto {
	range: ReportRangeDto;
	kind: StockKind | null;
	rows: StockTurnoverRowDto[];
}

export interface FunnelStageDto {
	stage: FunnelStage;
	count: number;
	shareOfPreviousBp: number | null; // null on the first stage and after an empty one
	shareOfFirstBp: number | null;
}
export interface FunnelReportDto {
	range: ReportRangeDto;
	stages: FunnelStageDto[];
	cancelledCount: number;
	rejectedCount: number;
}

export interface LostRequestRowDto {
	requestId: number;
	number: string;
	status: LostStatus;
	at: string; // moment of the terminal transition
	counterpartyId: number | null;
	counterpartyTitle: string | null;
	reasonTitle: string | null;
	comment: string | null;
	totalMinor: number;
}
export interface LostReasonRowDto {
	reasonId: number | null;
	title: string;
	count: number;
	totalMinor: number;
}
export interface LostReportDto {
	range: ReportRangeDto;
	status: LostStatus | null;
	cancelledCount: number;
	rejectedCount: number;
	totalMinor: number;
	reasons: LostReasonRowDto[];
	page: Page<LostRequestRowDto>;
}

export interface CharityTransferDto {
	id: number;
	amountMinor: number;
	transferredOn: string; // 'YYYY-MM-DD' in org.timezone
	documentRef: string | null;
	comment: string | null;
	createdByName: string;
	createdAt: string;
	reversalOfId: number | null; // this row cancels another one
	isReversed: boolean; // another row cancels this one
}
export interface CharityAccrualRowDto {
	counterpartyId: number;
	title: string;
	requestCount: number;
	amountMinor: number;
}
export interface CharityReportDto {
	range: ReportRangeDto;
	accruedAllMinor: number; // equals the banner's all-time figure
	transferredAllMinor: number;
	remainderMinor: number;
	accruedInRangeMinor: number;
	transferredInRangeMinor: number;
	accruals: CharityAccrualRowDto[];
	transfers: Page<CharityTransferDto>;
	canManage: boolean;
}

export interface DashboardDto {
	range: ReportRangeDto;
	sales: SalesTotalsDto;
	debtMinor: number; // current debt of all counterparties
	statusCounts: Record<Exclude<RequestStatus, 'draft'>, number>; // as of now
	payrollAccruedMinor: number; // accrued to the crew for days of the range
	charityAccruedInRangeMinor: number;
	charityRemainderMinor: number;
	belowThresholdCount: number;
	topCounterparties: SalesByCounterpartyRowDto[]; // five by totalMinor
	topModels: SalesByModelRowDto[]; // five by linesTotalMinor
}
