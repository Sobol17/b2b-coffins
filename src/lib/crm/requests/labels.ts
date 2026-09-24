import type { SelectOption } from '$lib/ui';
import type { AssigneeRole, AttentionFlag } from '$lib/types/crm-request';
import type { RequestPriority } from '$lib/types/request';

/** Words of the board, the registry, the card and the export sheet: one dictionary for all. */
export const PRIORITY_TITLE: Readonly<Record<RequestPriority, string>> = {
	normal: 'Обычный',
	urgent: 'Срочно'
};

export const FLAG_TITLE: Readonly<Record<AttentionFlag, string>> = {
	no_assignee: 'Нет исполнителя',
	payment_overdue: 'Долго ждёт оплаты'
};

export const ASSIGNEE_ROLE_TITLE: Readonly<Record<AssigneeRole, string>> = {
	carpenter: 'Столяр',
	painter: 'Маляр',
	driver: 'Водитель'
};

export const PRIORITY_OPTIONS: readonly (SelectOption & { value: RequestPriority })[] = [
	{ value: 'normal', label: PRIORITY_TITLE.normal },
	{ value: 'urgent', label: PRIORITY_TITLE.urgent }
];

export const FLAG_OPTIONS: readonly (SelectOption & { value: AttentionFlag })[] = [
	{ value: 'no_assignee', label: FLAG_TITLE.no_assignee },
	{ value: 'payment_overdue', label: FLAG_TITLE.payment_overdue }
];

export const ASSIGNEE_ROLE_OPTIONS: readonly (SelectOption & { value: AssigneeRole })[] = [
	{ value: 'carpenter', label: ASSIGNEE_ROLE_TITLE.carpenter },
	{ value: 'painter', label: ASSIGNEE_ROLE_TITLE.painter },
	{ value: 'driver', label: ASSIGNEE_ROLE_TITLE.driver }
];

/** The counterparty column of a stock request. */
export const STOCK_TITLE = 'На склад';
