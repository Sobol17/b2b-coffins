import type { NumberingPeriod } from '$lib/types/crm';

export type { NumberingPeriod };

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
	return {
		number: `${headOf(state.prefix, periodKey)}${String(value).padStart(DIGITS, '0')}`,
		periodKey,
		value
	};
}

/** Everything before the counter: the part two numbers of one sequence and period share. */
export function headOf(prefix: string, periodKey: string): string {
	return periodKey === '' ? prefix : `${prefix}${periodKey}-`;
}

/**
 * State after the owner changes the prefix or the period (C1). The counter goes on after the highest
 * number already issued in the same form, so a returning prefix never hands out a taken number and
 * the unique index on `requests.number` never fires.
 */
export function resumeSequence(
	settings: { readonly prefix: string; readonly period: NumberingPeriod },
	issued: readonly string[],
	at: Date,
	timeZone: string
): SequenceState {
	const periodKey = periodKeyOf(settings.period, at, timeZone);
	const head = headOf(settings.prefix, periodKey);
	let lastValue = 0;
	for (const number of issued) {
		if (!number.startsWith(head)) continue;
		const counter = number.slice(head.length);
		if (/^\d+$/.test(counter)) lastValue = Math.max(lastValue, Number(counter));
	}
	return { ...settings, periodKey, lastValue };
}
