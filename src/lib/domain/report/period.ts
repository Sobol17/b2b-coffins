import { addDays } from '$lib/domain/payroll/calc';
import { startOfDayInZone } from '$lib/domain/time/zone';
import type { ReportPreset, SalesBucket } from '$lib/types/crm-reports';

const DAY_MS = 86_400_000;

export interface ReportRange {
	readonly from: string;
	readonly to: string;
}
/** `to` is the first instant after the range: every filter is a half-open window. */
export interface ReportWindow {
	readonly from: Date;
	readonly to: Date;
	readonly days: number;
}
export type RangeProblem = 'not_a_date' | 'reversed' | 'too_long';

const utc = (isoDate: string): number => Date.parse(`${isoDate}T00:00:00.000Z`);
const isDate = (isoDate: string): boolean =>
	!Number.isNaN(utc(isoDate)) && new Date(utc(isoDate)).toISOString().slice(0, 10) === isoDate;

/** Both ends count: a range of one date is one day long. */
export function rangeDays(range: ReportRange): number {
	return Math.round((utc(range.to) - utc(range.from)) / DAY_MS) + 1;
}

export function rangeProblem(range: ReportRange, maxDays: number): RangeProblem | null {
	if (!isDate(range.from) || !isDate(range.to)) return 'not_a_date';
	if (range.from > range.to) return 'reversed';
	return rangeDays(range) > maxDays ? 'too_long' : null;
}

export function reportWindow(range: ReportRange, timeZone: string): ReportWindow | null {
	const from = startOfDayInZone(range.from, timeZone);
	const to = startOfDayInZone(addDays(range.to, 1), timeZone);
	return from === null || to === null ? null : { from, to, days: rangeDays(range) };
}

/** Monday of the week that holds the date. */
function weekStart(isoDate: string): string {
	const weekday = (new Date(utc(isoDate)).getUTCDay() + 6) % 7;
	return addDays(isoDate, -weekday);
}

function spanStart(isoDate: string, span: ReportPreset | SalesBucket): string {
	const [year, month] = [isoDate.slice(0, 4), Number(isoDate.slice(5, 7))];
	switch (span) {
		case 'day':
			return isoDate;
		case 'week':
			return weekStart(isoDate);
		case 'month':
			return `${isoDate.slice(0, 7)}-01`;
		case 'quarter':
			return `${year}-${String(month - ((month - 1) % 3)).padStart(2, '0')}-01`;
		case 'year':
			return `${year}-01-01`;
	}
}

function spanEnd(start: string, bucket: SalesBucket): string {
	if (bucket === 'day') return start;
	if (bucket === 'week') return addDays(start, 6);
	const next = new Date(utc(start));
	next.setUTCMonth(next.getUTCMonth() + 1);
	return addDays(next.toISOString().slice(0, 10), -1);
}

export function presetRange(preset: ReportPreset, today: string): ReportRange {
	return { from: spanStart(today, preset), to: today };
}

const later = (a: string, b: string): string => (a > b ? a : b);
const earlier = (a: string, b: string): string => (a < b ? a : b);

/** The bucket of the day, cut by the ends of the range. */
export function bucketOf(day: string, bucket: SalesBucket, range: ReportRange): ReportRange {
	const start = spanStart(day, bucket);
	return { from: later(start, range.from), to: earlier(spanEnd(start, bucket), range.to) };
}

export function bucketsOf(range: ReportRange, bucket: SalesBucket): ReportRange[] {
	const buckets: ReportRange[] = [];
	for (let day = range.from; day <= range.to;) {
		const next = bucketOf(day, bucket, range);
		buckets.push(next);
		day = addDays(next.to, 1);
	}
	return buckets;
}
