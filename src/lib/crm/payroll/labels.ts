import type { StatusTone } from '$lib/ui';
import type { PayrollPeriodStatus } from '$lib/types/crm-payroll';
import { formatDate, formatMinor } from '$lib/utils/format';

export const PERIOD_STATUS_TITLE: Readonly<Record<PayrollPeriodStatus, string>> = {
	open: 'Открыта',
	calculated: 'Закрыта',
	paid: 'Выплачена'
};

export const PERIOD_STATUS_TONE: Readonly<Record<PayrollPeriodStatus, StatusTone>> = {
	open: 'progress',
	calculated: 'neutral',
	paid: 'success'
};

/** A payroll day is a calendar date, so it is formatted without a time zone shift. */
export function dayTitle(date: string): string {
	return formatDate(`${date}T00:00:00Z`);
}

export function weekdayTitle(date: string): string {
	return new Date(`${date}T00:00:00Z`).toLocaleDateString('ru-RU', {
		weekday: 'short',
		timeZone: 'UTC'
	});
}

export function roubles(minor: number): string {
	return `${formatMinor(minor)} ₽`;
}

export function signedRoubles(minor: number): string {
	return minor > 0 ? `+${formatMinor(minor)} ₽` : roubles(minor);
}
