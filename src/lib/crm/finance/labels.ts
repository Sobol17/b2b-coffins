import type { FinanceKind, FinanceSource } from '$lib/types/finance';

/** One set of names for the page, its filters and the sheet. */
export const FINANCE_SOURCE_TITLE: Readonly<Record<FinanceSource, string>> = {
	order_payment: 'Оплата заявки',
	manual_income: 'Прочий доход',
	payroll: 'Выплата бригаде',
	charity: 'Перечисление в фонд',
	manual_expense: 'Прочий расход'
};

export const FINANCE_KIND_TITLE: Readonly<Record<FinanceKind, string>> = {
	income: 'Доход',
	expense: 'Расход'
};

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

const dayMonth = (isoDate: string): string => `${isoDate.slice(8, 10)}.${isoDate.slice(5, 7)}`;

/** The short caption under a bar and the full one for the hint and screen readers. */
export function bucketCaption(
	bucket: { from: string; to: string },
	kind: 'day' | 'week' | 'month'
): { short: string; full: string } {
	if (kind === 'day') return { short: bucket.from.slice(8, 10), full: dayMonth(bucket.from) };
	if (kind === 'week') {
		return {
			short: dayMonth(bucket.from),
			full: `${dayMonth(bucket.from)}–${dayMonth(bucket.to)}`
		};
	}
	const month = MONTHS[Number(bucket.from.slice(5, 7)) - 1] ?? '';
	return { short: month, full: `${month} ${bucket.from.slice(0, 4)}` };
}

/** A sum with its sign in the text: colour alone does not carry the meaning. */
export function signedAmount(minor: number, format: (value: number) => string): string {
	if (minor > 0) return `+${format(minor)}`;
	if (minor < 0) return `−${format(-minor)}`;
	return format(0);
}
