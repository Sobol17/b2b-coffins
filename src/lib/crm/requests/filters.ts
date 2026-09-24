import { FLAG_OPTIONS, PRIORITY_OPTIONS, STOCK_TITLE } from './labels';
import type { FilterField, SelectOption } from '$lib/ui';
import { REQUEST_STATUS_META } from '$lib/ui/status';
import { REQUEST_STATUSES } from '$lib/types/request';

/** Query keys the board and the registry read; `status` belongs to the registry only. */
export const REQUEST_FILTER_KEYS = [
	'search',
	'status',
	'counterparty',
	'priority',
	'flag',
	'from',
	'to'
] as const;

const STATUS_OPTIONS: readonly SelectOption[] = REQUEST_STATUSES.filter(
	(status) => status !== 'draft'
).map((status) => ({ value: status, label: REQUEST_STATUS_META[status].label }));

/** One set of filter fields for both screens, so a filter link means the same on each. */
export function requestFilterFields(
	counterparties: readonly { id: number; name: string }[],
	withStatusAndPeriod: boolean
): FilterField[] {
	const all = (label: string): SelectOption => ({ value: '', label });
	return [
		{ key: 'search', label: 'Поиск', type: 'text', placeholder: 'Номер, контрагент или ФИО' },
		...(withStatusAndPeriod
			? [
					{
						key: 'status',
						label: 'Статус',
						type: 'select' as const,
						placeholder: 'Выберите статус',
						options: [all('Все статусы'), ...STATUS_OPTIONS]
					}
				]
			: []),
		{
			key: 'counterparty',
			label: 'Контрагент',
			type: 'select',
			placeholder: 'Выберите контрагента',
			options: [
				all('Все'),
				{ value: 'stock', label: STOCK_TITLE },
				...counterparties.map((row) => ({ value: String(row.id), label: row.name }))
			]
		},
		{
			key: 'priority',
			label: 'Приоритет',
			type: 'select',
			placeholder: 'Выберите приоритет',
			options: [all('Любой'), ...PRIORITY_OPTIONS]
		},
		{
			key: 'flag',
			label: 'Внимание',
			type: 'select',
			placeholder: 'Выберите флаг',
			options: [all('Все заявки'), ...FLAG_OPTIONS]
		},
		...(withStatusAndPeriod
			? [
					{
						key: 'from',
						label: 'Отправлена с',
						type: 'date' as const,
						placeholder: 'Выберите дату'
					},
					{ key: 'to', label: 'по', type: 'date' as const, placeholder: 'Выберите дату' }
				]
			: [])
	];
}
