import type { SelectOption } from '$lib/ui';
import type { AttentionFlag } from '$lib/types/crm-request';
import type { RequestPriority } from '$lib/types/request';

/** Words of the board, the registry, the card and the export sheet: one dictionary for all. */
export const PRIORITY_TITLE: Readonly<Record<RequestPriority, string>> = {
	normal: 'Обычный',
	urgent: 'Срочно'
};

export const FLAG_TITLE: Readonly<Record<AttentionFlag, string>> = {
	payment_overdue: 'Долго ждёт оплаты'
};

export const PRIORITY_OPTIONS: readonly (SelectOption & { value: RequestPriority })[] = [
	{ value: 'normal', label: PRIORITY_TITLE.normal },
	{ value: 'urgent', label: PRIORITY_TITLE.urgent }
];

export const FLAG_OPTIONS: readonly (SelectOption & { value: AttentionFlag })[] = [
	{ value: 'payment_overdue', label: FLAG_TITLE.payment_overdue }
];

/** The counterparty column of a stock request. */
export const STOCK_TITLE = 'На склад';
