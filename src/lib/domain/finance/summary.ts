import { bucketsOf, rangeDays, type ReportRange } from '$lib/domain/report/period';
import type { SalesBucket } from '$lib/types/crm-reports';
import {
	FINANCE_SOURCES,
	type FinanceBucketDto,
	type FinanceKind,
	type FinanceSource,
	type FinanceSourceTotalDto,
	type FinanceSummaryDto
} from '$lib/types/finance';

/** One line of the feed, already turned into a day of org.timezone. */
export interface FinanceLine {
	readonly source: FinanceSource;
	readonly occurredOn: string;
	/** Positive for money in, negative for money out; a reversal carries the opposite sign. */
	readonly signedMinor: number;
}

const DAY_BUCKET_MAX = 31;
const WEEK_BUCKET_MAX = 92;

const KIND: Readonly<Record<FinanceSource, FinanceKind>> = {
	order_payment: 'income',
	manual_income: 'income',
	payroll: 'expense',
	charity: 'expense',
	manual_expense: 'expense'
};

/**
 * The source decides the kind, not the sign: a reversed payment lowers income instead of showing up
 * as an expense, and a reversed fund transfer lowers expense instead of showing up as income.
 */
export function kindOf(source: FinanceSource): FinanceKind {
	return KIND[source];
}

/** Enough bars to read the trend, few enough to fit a phone. */
export function pickBucket(range: ReportRange): SalesBucket {
	const days = rangeDays(range);
	if (days <= DAY_BUCKET_MAX) return 'day';
	return days <= WEEK_BUCKET_MAX ? 'week' : 'month';
}

const within = (line: FinanceLine, range: ReportRange): boolean =>
	line.occurredOn >= range.from && line.occurredOn <= range.to;

/** Income adds the signed sum, expense subtracts it: money out is a positive expense. */
function split(lines: readonly FinanceLine[]): { incomeMinor: number; expenseMinor: number } {
	let incomeMinor = 0;
	let expenseMinor = 0;
	for (const line of lines) {
		if (kindOf(line.source) === 'income') incomeMinor += line.signedMinor;
		else expenseMinor -= line.signedMinor;
	}
	return { incomeMinor, expenseMinor };
}

function bySource(lines: readonly FinanceLine[]): FinanceSourceTotalDto[] {
	return FINANCE_SOURCES.map((source) => {
		const own = lines.filter((line) => line.source === source);
		return {
			source,
			signedMinor: own.reduce((sum, line) => sum + line.signedMinor, 0),
			count: own.length
		};
	});
}

function buckets(
	lines: readonly FinanceLine[],
	range: ReportRange,
	bucket: SalesBucket
): FinanceBucketDto[] {
	return bucketsOf(range, bucket).map((b) => ({
		from: b.from,
		to: b.to,
		...split(lines.filter((line) => within(line, b)))
	}));
}

/** Totals, the five sources and the chart of a period; lines outside the range are dropped. */
export function summarize(lines: readonly FinanceLine[], range: ReportRange): FinanceSummaryDto {
	const inRange = lines.filter((line) => within(line, range));
	const { incomeMinor, expenseMinor } = split(inRange);
	const bucket = pickBucket(range);
	return {
		range: { from: range.from, to: range.to },
		incomeMinor,
		expenseMinor,
		netMinor: incomeMinor - expenseMinor,
		bySource: bySource(inRange),
		bucket,
		buckets: buckets(inRange, range, bucket)
	};
}
