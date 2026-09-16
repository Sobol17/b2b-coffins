<script lang="ts">
	import { DataTable, MoneyInput, PriceCell, type DataTableColumn } from '$lib/ui';
	import type { ListQuery } from '$lib/types/list';
	import type { AgencyPriceRowDto } from '$lib/types/pricing';

	let {
		rows,
		total,
		query,
		onQueryChange
	}: {
		rows: readonly AgencyPriceRowDto[];
		total: number;
		query: ListQuery;
		onQueryChange: (next: ListQuery) => void;
	} = $props();

	const columns: DataTableColumn[] = [
		{ key: 'title', label: 'Модель', sortable: true },
		{ key: 'categoryTitle', label: 'Раздел' },
		{ key: 'purchase', label: 'Закупочная', align: 'end' },
		{ key: 'agency', label: 'Ваша цена', align: 'end' }
	];

	// DataTable keys its rows by `id`; the model is the row here, one price per card (tech.md P7).
	const tableRows = $derived(rows.map((row) => ({ ...row, id: row.productId })));
</script>

<DataTable
	{columns}
	rows={tableRows}
	{total}
	{query}
	{onQueryChange}
	emptyTitle="Моделей не найдено"
>
	{#snippet cell(row: AgencyPriceRowDto & { id: number }, column: DataTableColumn)}
		{#if column.key === 'title'}
			<div>{row.title}</div>
			<div class="text-xs text-fg-faint">{row.sku}</div>
		{:else if column.key === 'categoryTitle'}
			{row.categoryTitle ?? '—'}
		{:else if column.key === 'purchase'}
			<PriceCell valueMinor={row.minPurchasePriceMinor} class="text-fg-faint" />
		{:else if column.key === 'agency'}
			{#key row.agencyPriceMinor}
				<div class="ml-auto w-40" data-testid="agency-price-input">
					<MoneyInput
						name={`price:${row.productId}`}
						valueMinor={row.agencyPriceMinor ?? 0}
						label=""
					/>
				</div>
			{/key}
		{/if}
	{/snippet}
</DataTable>
