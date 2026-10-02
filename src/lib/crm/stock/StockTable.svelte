<script lang="ts">
	import { resolve } from '$app/paths';
	import { DataTable, TONE_CLASS, type DataTableColumn } from '$lib/ui';
	import type { StockRowDto } from '$lib/types/crm-stock';
	import type { ListQuery } from '$lib/types/list';
	import { KIND_TITLE } from './labels';

	let {
		rows,
		total,
		query,
		onQueryChange,
		exportUrl
	}: {
		rows: readonly StockRowDto[];
		total: number;
		query: ListQuery;
		onQueryChange: (next: ListQuery) => void;
		exportUrl: string;
	} = $props();

	const columns: DataTableColumn[] = [
		{ key: 'code', label: 'Код', sortable: true },
		{ key: 'title', label: 'Название', sortable: true },
		{ key: 'kind', label: 'Вид' },
		{ key: 'balance', label: 'Остаток', align: 'end' },
		{ key: 'minThreshold', label: 'Порог', align: 'end' },
		{ key: 'state', label: 'Состояние' },
		{ key: 'actions', label: 'Действия', align: 'end' }
	];
</script>

<DataTable
	{columns}
	{rows}
	{total}
	{query}
	{onQueryChange}
	{exportUrl}
	emptyTitle="Позиций не найдено"
>
	{#snippet cell(row: StockRowDto, column: DataTableColumn)}
		{#if column.key === 'code'}
			<span class="text-fg-muted">{row.code}</span>
		{:else if column.key === 'title'}
			<div class={row.isActive ? '' : 'text-fg-muted'}>{row.title}</div>
		{:else if column.key === 'kind'}
			{KIND_TITLE[row.kind]}
		{:else if column.key === 'balance'}
			<span
				class={['font-medium', row.balance < 0 || row.isNegative ? 'text-danger' : '']}
				data-testid="stock-balance"
			>
				{row.balance}
			</span>
			<span class="text-xs text-fg-muted">{row.unitTitle}</span>
		{:else if column.key === 'minThreshold'}
			{row.minThreshold === 0 ? '—' : row.minThreshold}
		{:else if column.key === 'state'}
			<div class="flex flex-wrap gap-1">
				{#if row.isNegative}
					<span class={['rounded-pill px-2 py-0.5 text-xs', TONE_CLASS.danger]}>Минус</span>
				{/if}
				{#if row.isBelowThreshold}
					<span class={['rounded-pill px-2 py-0.5 text-xs', TONE_CLASS.warning]}>
						Ниже порога
					</span>
				{/if}
				{#if !row.isActive}
					<span class={['rounded-pill px-2 py-0.5 text-xs', TONE_CLASS.neutral]}>Выключена</span>
				{/if}
			</div>
		{:else if column.key === 'actions'}
			<a class="text-link" href={resolve(`/crm/stock/${row.id}`)}>Открыть</a>
		{/if}
	{/snippet}
</DataTable>
