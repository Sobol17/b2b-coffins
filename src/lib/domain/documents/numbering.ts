export type NumberingPeriod = 'none' | 'year' | 'month';

export interface SequenceState {
	readonly prefix: string;
	readonly period: NumberingPeriod;
	readonly periodKey: string;
	readonly lastValue: number;
}

export interface NextNumber {
	readonly number: string;
	readonly periodKey: string;
	readonly value: number;
}

const DIGITS = 5;

/** Period of a moment in the organisation timezone: '' for none, '2026' for year, '2026-09' for month. */
export function periodKeyOf(period: NumberingPeriod, at: Date, timeZone: string): string {
	if (period === 'none') return '';
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit'
	}).formatToParts(at);
	const year = parts.find((part) => part.type === 'year')?.value ?? '';
	const month = parts.find((part) => part.type === 'month')?.value ?? '';
	return period === 'year' ? year : `${year}-${month}`;
}

/**
 * Next number of a sequence (`numbering_sequences`). A new period starts counting from one again,
 * and the period is part of the number, so numbers never repeat across periods.
 */
export function nextNumber(state: SequenceState, at: Date, timeZone: string): NextNumber {
	const periodKey = periodKeyOf(state.period, at, timeZone);
	const value = periodKey === state.periodKey ? state.lastValue + 1 : 1;
	const body = String(value).padStart(DIGITS, '0');
	const number =
		periodKey === '' ? `${state.prefix}${body}` : `${state.prefix}${periodKey}-${body}`;
	return { number, periodKey, value };
}
