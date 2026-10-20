import { PAYROLL_SHARE_STEP_MINOR } from '$lib/types/crm-payroll';

const DAY_MS = 86_400_000;

export interface EntryAmount {
	readonly qty: number;
	readonly rateMinor: number;
}

/** One entry of a day: its sum and the crew that did it. */
export interface CrewEntry {
	readonly amountMinor: number;
	readonly staffIds: readonly number[];
}

export interface StaffShare {
	readonly staffId: number;
	readonly shareMinor: number;
}

/** A marked day: who came and what each of them earned. */
export interface DayShares {
	readonly staffIds: readonly number[];
	readonly shares: readonly StaffShare[];
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

/** An exact sum of fractions: a crew of three splits 200 roubles into thirds of a kopeck. */
interface Fraction {
	readonly num: bigint;
	readonly den: bigint;
}

function gcd(a: bigint, b: bigint): bigint {
	return b === 0n ? a : gcd(b, a % b);
}

function addFraction(sum: Fraction, num: bigint, den: bigint): Fraction {
	const nextNum = sum.num * den + num * sum.den;
	const nextDen = sum.den * den;
	const divisor = gcd(nextNum, nextDen) || 1n;
	return { num: nextNum / divisor, den: nextDen / divisor };
}

/**
 * Each present worker's pay for the day (tech.md v1.55): every entry is split equally among its
 * crew, a worker's parts are summed exactly, and the sum goes down to a whole rouble once. The
 * remainder stays with the workshop, so the day never pays out more than it made. A worker in no
 * crew gets 0; the result follows the order of `presentIds`.
 */
export function dayShares(
	presentIds: readonly number[],
	entries: readonly CrewEntry[]
): StaffShare[] {
	const sums = new Map<number, Fraction>(presentIds.map((id) => [id, { num: 0n, den: 1n }]));
	for (const entry of entries) {
		const crew = BigInt(entry.staffIds.length);
		for (const staffId of entry.staffIds) {
			const sum = sums.get(staffId);
			if (sum) sums.set(staffId, addFraction(sum, BigInt(entry.amountMinor), crew));
		}
	}
	const step = BigInt(PAYROLL_SHARE_STEP_MINOR);
	return presentIds.map((staffId) => {
		const sum = sums.get(staffId) ?? { num: 0n, den: 1n };
		return { staffId, shareMinor: Number((sum.num / (sum.den * step)) * step) };
	});
}

/** Days and accrual per worker over the days given, in the order workers first appear. */
export function weekAccruals(days: readonly DayShares[]): WeekAccrual[] {
	const byStaff = new Map<number, { daysWorked: number; accruedMinor: number }>();
	for (const day of days) {
		const shares = new Map(day.shares.map((row) => [row.staffId, row.shareMinor]));
		for (const staffId of day.staffIds) {
			const line = byStaff.get(staffId) ?? { daysWorked: 0, accruedMinor: 0 };
			line.daysWorked += 1;
			line.accruedMinor += shares.get(staffId) ?? 0;
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
