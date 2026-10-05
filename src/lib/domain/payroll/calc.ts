import { PAYROLL_SHARE_STEP_MINOR } from '$lib/types/crm-payroll';

const DAY_MS = 86_400_000;

export interface EntryAmount {
	readonly qty: number;
	readonly rateMinor: number;
}

export interface DayShare {
	readonly staffIds: readonly number[];
	readonly shareMinor: number;
}

export interface WeekAccrual {
	readonly staffId: number;
	readonly daysWorked: number;
	readonly accruedMinor: number;
}

export function entryAmountMinor(entry: EntryAmount): number {
	return entry.qty * entry.rateMinor;
}

export function dayTotalMinor(entries: readonly EntryAmount[]): number {
	return entries.reduce((sum, entry) => sum + entryAmountMinor(entry), 0);
}

/**
 * One worker's pay for the day (tech.md v1.48): the day's sum split equally, down to a whole
 * rouble. The remainder stays with the workshop, so the shares never exceed what the day made.
 */
export function dayShareMinor(totalMinor: number, headcount: number): number {
	if (headcount <= 0) return 0;
	const step = PAYROLL_SHARE_STEP_MINOR;
	return Math.floor(totalMinor / headcount / step) * step;
}

/** Days and accrual per worker over the days given, in the order workers first appear. */
export function weekAccruals(days: readonly DayShare[]): WeekAccrual[] {
	const byStaff = new Map<number, { daysWorked: number; accruedMinor: number }>();
	for (const day of days) {
		for (const staffId of day.staffIds) {
			const line = byStaff.get(staffId) ?? { daysWorked: 0, accruedMinor: 0 };
			line.daysWorked += 1;
			line.accruedMinor += day.shareMinor;
			byStaff.set(staffId, line);
		}
	}
	return [...byStaff].map(([staffId, line]) => ({ staffId, ...line }));
}

export function payoutMinor(accruedMinor: number, adjustmentMinor: number): number {
	return accruedMinor + adjustmentMinor;
}

/** Calendar arithmetic on 'YYYY-MM-DD': a payroll day is a date of the workshop, not an instant. */
export function addDays(isoDate: string, days: number): string {
	return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * The first day of the payroll week that holds the date. `closingDay` is the ISO weekday the past
 * week is closed on (1 is Monday), and the next week starts on that same day.
 */
export function weekStartOf(isoDate: string, closingDay: number): string {
	const weekday = new Date(`${isoDate}T00:00:00Z`).getUTCDay() || 7;
	return addDays(isoDate, -((weekday - closingDay + 7) % 7));
}

export function weekDatesOf(startsOn: string): string[] {
	return Array.from({ length: 7 }, (_, index) => addDays(startsOn, index));
}
