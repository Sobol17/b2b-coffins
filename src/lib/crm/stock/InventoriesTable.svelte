<script lang="ts">
	import { resolve } from '$app/paths';
	import { DataTable, TONE_CLASS, type DataTableColumn } from '$lib/ui';
	import type { InventoryRowDto } from '$lib/types/crm-stock';
	import type { ListQuery } from '$lib/types/list';
	import { formatDateTime } from '$lib/utils/format';
	import { INVENTORY_STATUS_TITLE, KIND_PLURAL } from './labels';

	let {
		rows,
		total,
		query,
		onQueryChange,
		timeZone
	}: {
		rows: readonly InventoryRowDto[];
		total: number;
		query: ListQuery;
		onQueryChange: (next: ListQuery) => void;
		timeZone: string;
	} = $props();

	const columns: DataTableColumn[] = [
		{ key: 'id', label: 'Номер' },
		{ key: 'kind', label: 'Вид' },
		{ key: 'status', label: 'Статус' },
		{ key: 'createdAt', label: 'Открыта' },
		{ key: 'appliedAt', label: 'Проведена' },
		{ key: 'diff', label: 'Расхождений', align: 'end' },
		{ key: 'author', label: 'Кто открыл' },
		{ key: 'actions', label: 'Действия', align: 'end' }
	];
</script>

<DataTable {columns} {rows} {total} {query} {onQueryChange} emptyTitle="Инвентаризаций ещё не было">
	{#snippet cell(row: InventoryRowDto, column: DataTableColumn)}
		{#if column.key === 'id'}
			№ {row.id}
		{:else if column.key === 'kind'}
			{KIND_PLURAL[row.kind]}
		{:else if column.key === 'status'}
			<span
				class={[
					'rounded-pill px-2 py-0.5 text-xs',
					row.status === 'draft' ? TONE_CLASS.progress : TONE_CLASS.success
				]}
			>
				{INVENTORY_STATUS_TITLE[row.status]}
			</span>
		{:else if column.key === 'createdAt'}
			{formatDateTime(row.createdAt, timeZone)}
		{:else if column.key === 'appliedAt'}
			{row.appliedAt === null ? '—' : formatDateTime(row.appliedAt, timeZone)}
		{:else if column.key === 'diff'}
			{row.diffCount} из {row.lineCount}
		{:else if column.key === 'author'}
			{row.createdByName}
		{:else if column.key === 'actions'}
			<a class="text-link" href={resolve(`/crm/stock/inventories/${row.id}`)}>Открыть</a>
		{/if}
	{/snippet}
</DataTable>
