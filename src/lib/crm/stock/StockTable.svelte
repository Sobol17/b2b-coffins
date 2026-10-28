<script lang="ts">
	import { resolve } from '$app/paths';
	import { DataTable, TONE_CLASS, type DataTableColumn } from '$lib/ui';
	import type { StockRowDto } from '$lib/types/crm-stock';
	import type { ListQuery } from '$lib/types/list';
	import { formatMinor } from '$lib/utils/format';
	import { KIND_TITLE } from './labels';

	let {
		rows,
		total,
		query,
		onQueryChange,
		exportUrl,
		canSeeCost = false
	}: {
		rows: readonly StockRowDto[];
		total: number;
		query: ListQuery;
		onQueryChange: (next: ListQuery) => void;
		exportUrl: string;
		/** Adds the cost column: owner and administrator only (v1.62). */
		canSeeCost?: boolean;
	} = $props();

	const columns: DataTableColumn[] = $derived([
		// The name goes first: a phone card takes the first column as its title.
		{ key: 'title', label: 'Название', sortable: true },
		{ key: 'code', label: 'Код', sortable: true },
		{ key: 'kind', label: 'Вид' },
		{ key: 'balance', label: 'Остаток', align: 'end' },
		{ key: 'minThreshold', label: 'Порог', align: 'end' },
		...(canSeeCost
			? [{ key: 'cost', label: 'Себестоимость', align: 'end' } satisfies DataTableColumn]
			: []),
		{ key: 'state', label: 'Состояние' }
	]);
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
			<a
				class={['font-medium hover:text-link-hover', row.isActive ? 'text-link' : 'text-fg-muted']}
				href={resolve(`/crm/stock/${row.id}`)}>{row.title}</a
			>
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
		{:else if column.key === 'cost'}
			<span class="tabular-nums" data-testid="stock-cost">
				{row.costPriceMinor ? `${formatMinor(row.costPriceMinor)} ₽` : '—'}
			</span>
		{:else if column.key === 'minThreshold'}
			{row.minThreshold === 0 ? '—' : row.minThreshold}
		{:else if column.key === 'state' && (row.isNegative || row.isBelowThreshold || !row.isActive)}
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
		{/if}
	{/snippet}
</DataTable>
