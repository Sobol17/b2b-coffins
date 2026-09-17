import type { Minor } from '$lib/types/money';
import { toMinor } from './money';

/** What a role without prices sees in place of a number (tech.md 8.1). */
export const PRICE_DASH = '—';

const GROUP_SEPARATOR = ' ';
const DECIMAL_SEPARATOR = ',';

function groupThousands(digits: string): string {
	let out = '';
	for (let i = digits.length; i > 0; i -= 3) {
		const chunk = digits.slice(Math.max(0, i - 3), i);
		out = out === '' ? chunk : `${chunk}${GROUP_SEPARATOR}${out}`;
	}
	return out === '' ? '0' : out;
}

/**
 * Renders whole kopecks as rubles. An absent amount is a dash, never a zero: a role without prices
 * gets no value from the server, and printing 0 would read as "free".
 */
export function formatMinor(minor?: number | null): string {
	if (minor === undefined || minor === null) return PRICE_DASH;
	const whole = Math.trunc(minor);
	const abs = Math.abs(whole);
	const kopecks = String(abs % 100).padStart(2, '0');
	const sign = whole < 0 ? '-' : '';
	return `${sign}${groupThousands(String(Math.trunc(abs / 100)))}${DECIMAL_SEPARATOR}${kopecks}`;
}

const RUBLES_PATTERN = /^-?\d+([.,]\d{0,2})?$/;

/** Reads a ruble input back into whole kopecks. Returns null when the text is not an amount. */
export function parseRublesToMinor(input: string): Minor | null {
	const cleaned = input.replace(/\s/g, '');
	if (!RUBLES_PATTERN.test(cleaned)) return null;
	return toMinor(Number(cleaned.replace(DECIMAL_SEPARATOR, '.')));
}

function parts(iso: string, timeZone: string): Record<string, string> {
	const formatter = new Intl.DateTimeFormat('ru-RU', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	});
	const found: Record<string, string> = {};
	for (const part of formatter.formatToParts(new Date(iso))) found[part.type] = part.value;
	return found;
}

/*
 * Timestamps are stored in UTC (tech.md 13.1). The organisation timezone lives in the `org.timezone`
 * setting, so the slice that loads it passes it in; UTC is the fallback, not a second default.
 */
export function formatDate(iso: string, timeZone = 'UTC'): string {
	const p = parts(iso, timeZone);
	return `${p.day}.${p.month}.${p.year}`;
}

export function formatDateTime(iso: string, timeZone = 'UTC'): string {
	const p = parts(iso, timeZone);
	return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`;
}

const DAY_MONTH = new Map<string, Intl.DateTimeFormat>();

/** "16 июня": the short date of lists, where the year is the current one by context. */
export function formatDayMonth(iso: string, timeZone = 'UTC'): string {
	let formatter = DAY_MONTH.get(timeZone);
	if (formatter === undefined) {
		formatter = new Intl.DateTimeFormat('ru-RU', { timeZone, day: 'numeric', month: 'long' });
		DAY_MONTH.set(timeZone, formatter);
	}
	return formatter.format(new Date(iso));
}

/** Forms for one, few and many: ['позиция', 'позиции', 'позиций']. */
export type PluralForms = readonly [string, string, string];

export function pluralRu(count: number, [one, few, many]: PluralForms): string {
	const tens = Math.abs(count) % 100;
	const units = tens % 10;
	if (tens >= 11 && tens <= 14) return many;
	if (units === 1) return one;
	if (units >= 2 && units <= 4) return few;
	return many;
}

// Sizes are stored in millimetres and grams (tech.md 5.4); the storefront speaks centimetres and kilos.
function centimetres(mm: number): string {
	return String(Math.round(mm / 10));
}

/** "180 / 190 / 200 см", or an empty string when no length is known. */
export function formatLengthsCm(lengthsMm: readonly number[]): string {
	return lengthsMm.length === 0 ? '' : `${lengthsMm.map(centimetres).join(' / ')} см`;
}

export function formatDimensionsCm(
	lengthMm: number | null,
	widthMm: number | null,
	heightMm: number | null
): string {
	return `${[lengthMm, widthMm, heightMm].map((mm) => (mm === null ? '—' : centimetres(mm))).join(' × ')} см`;
}

export function formatWeightKg(weightG: number | null): string {
	if (weightG === null) return '—';
	return `${(weightG / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} кг`;
}
