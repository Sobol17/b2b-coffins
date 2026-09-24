<script lang="ts">
	import { resolve } from '$app/paths';
	import { SCHEME_OPTIONS } from '$lib/crm/labels';
	import { DataTable, type DataTableColumn } from '$lib/ui';
	import type { CrmCounterpartyListItemDto } from '$lib/types/crm-counterparty';
	import type { ListQuery } from '$lib/types/list';
	import DebtIndicator from './DebtIndicator.svelte';

	let {
		rows,
		total,
		query,
		onQueryChange
	}: {
		rows: readonly CrmCounterpartyListItemDto[];
		total: number;
		query: ListQuery;
		onQueryChange: (next: ListQuery) => void;
	} = $props();

	const columns: DataTableColumn[] = [
		{ key: 'name', label: 'Контрагент', sortable: true },
		{ key: 'managerName', label: 'Администратор' },
		{ key: 'settlementScheme', label: 'Расчёты' },
		{ key: 'staffCount', label: 'Сотрудников' },
		{ key: 'debt', label: 'Задолженность' },
		{ key: 'actions', label: 'Действия', align: 'end' }
	];

	const schemeLabel = (value: CrmCounterpartyListItemDto['settlementScheme']) =>
		SCHEME_OPTIONS.find((option) => option.value === value)?.label ?? value;
</script>

<DataTable {columns} {rows} {total} {query} {onQueryChange} emptyTitle="Контрагентов не найдено">
	{#snippet cell(row: CrmCounterpartyListItemDto, column: DataTableColumn)}
		{#if column.key === 'name'}
			<div>{row.name}</div>
			<div class="text-xs text-fg-faint">{row.inn ? `ИНН ${row.inn}` : 'ИНН не указан'}</div>
		{:else if column.key === 'managerName'}
			{row.managerName ?? '—'}
		{:else if column.key === 'settlementScheme'}
			{schemeLabel(row.settlementScheme)}
		{:else if column.key === 'staffCount'}
			{row.staffCount}
		{:else if column.key === 'debt'}
			<DebtIndicator
				debt={row.debtMinor === undefined ? undefined : { debtMinor: row.debtMinor }}
			/>
		{:else if column.key === 'actions'}
			<a class="text-link" href={resolve(`/crm/counterparties/${row.id}`)}> Открыть </a>
		{/if}
	{/snippet}
</DataTable>
