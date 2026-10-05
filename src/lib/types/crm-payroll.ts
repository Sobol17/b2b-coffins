// Staff, work prices, day sheets and the weekly payroll (C10, tech.md v1.48). Read by payroll.read only.
export const PAYROLL_PERIOD_STATUSES = ['open', 'calculated', 'paid'] as const;
export type PayrollPeriodStatus = (typeof PAYROLL_PERIOD_STATUSES)[number];
/** Units of one work in a day. */
export const PAYROLL_QTY_MAX = 10_000;
/** 1 000 000 roubles per unit. */
export const PAYROLL_RATE_MAX_MINOR = 100_000_000;
export const PAYROLL_ADJUSTMENT_MAX_MINOR = 100_000_000;
/** A share is whole roubles, rounded down. */
export const PAYROLL_SHARE_STEP_MINOR = 100;
export const PAYROLL_REPORT_MAX_DAYS = 366;

export interface StaffDto {
	id: number;
	fullName: string;
	position: string | null;
	isActive: boolean;
	hasAccount: boolean;
}

export interface WorkTypeDto {
	id: number;
	title: string;
	rateMinor: number;
	isActive: boolean;
}

export interface WorkEntryDto {
	workTypeId: number;
	title: string;
	qty: number;
	rateMinor: number;
	amountMinor: number;
}

export interface WorkDayStaffDto {
	id: number;
	fullName: string;
	position: string | null;
	present: boolean;
}

export interface WorkDayDto {
	/** 'YYYY-MM-DD' in org.timezone. */
	date: string;
	weekStartsOn: string;
	periodStatus: PayrollPeriodStatus;
	/** The period is open and the actor holds payroll.manage. */
	canEdit: boolean;
	/** Nobody is marked yet and an earlier marked day exists. */
	canCopyPrevious: boolean;
	/** Active staff plus whoever is already on the day. */
	staff: WorkDayStaffDto[];
	/** Active ones plus those already on the day. */
	workTypes: WorkTypeDto[];
	entries: WorkEntryDto[];
	presentCount: number;
	totalMinor: number;
	shareMinor: number;
}

export interface PayrollDayCellDto {
	date: string;
	presentCount: number;
	totalMinor: number;
	shareMinor: number;
}

export interface PayrollLineDto {
	/** Null until the line is stored. */
	id: number | null;
	staffId: number;
	fullName: string;
	position: string | null;
	daysWorked: number;
	accruedMinor: number;
	adjustmentMinor: number;
	adjustmentComment: string | null;
	/** accruedMinor + adjustmentMinor, never below zero. */
	payoutMinor: number;
	paidAt: string | null;
	paidComment: string | null;
}

export interface PayrollWeekDto {
	/** Null until the first day or adjustment of the week. */
	periodId: number | null;
	/** 'YYYY-MM-DD', both inside the week. */
	startsOn: string;
	endsOn: string;
	status: PayrollPeriodStatus;
	closedAt: string | null;
	closedByName: string | null;
	/** Seven cells, a day nobody marked has zeros. */
	days: PayrollDayCellDto[];
	/** Open: active staff plus anyone with a day or an adjustment; closed: the frozen lines. */
	lines: PayrollLineDto[];
	totalPayoutMinor: number;
	canManage: boolean;
}

export interface PayrollReportDto {
	from: string;
	to: string;
	staff: { staffId: number; fullName: string; daysWorked: number; accruedMinor: number }[];
	works: { workTypeId: number; title: string; qty: number; amountMinor: number }[];
	/** The two totals differ by the rounding remainder. */
	worksTotalMinor: number;
	accruedTotalMinor: number;
}
