import { ROLE_TITLE } from '$lib/crm/labels';
import type { SelectOption, StatusTone } from '$lib/ui';
import type { PayrollPeriodStatus, WorkTypeDto } from '$lib/types/crm-payroll';
import { WORK_ROLES } from '$lib/types/roles';
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

const GENERAL_WORK = 'Общая работа';

/** Shop roles in the order of the floor, a general work first: the select of the work dialog. */
export const WORK_ROLE_OPTIONS: readonly SelectOption[] = [
	{ value: '', label: GENERAL_WORK },
	...WORK_ROLES.map((role) => ({ value: role, label: ROLE_TITLE[role] }))
];

export function workRoleTitle(work: Pick<WorkTypeDto, 'roleCode'>): string {
	return work.roleCode === null ? GENERAL_WORK : ROLE_TITLE[work.roleCode];
}

/** «Шлифовщик: Шлифовка»: the day form lists works of every role in one select. */
export function workTitle(work: Pick<WorkTypeDto, 'roleCode' | 'title'>): string {
	return work.roleCode === null ? work.title : `${ROLE_TITLE[work.roleCode]}: ${work.title}`;
}

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
