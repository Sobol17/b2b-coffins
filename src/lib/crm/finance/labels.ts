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
