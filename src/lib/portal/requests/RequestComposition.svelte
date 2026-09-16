<script lang="ts">
	import PricePair from '$lib/portal/PricePair.svelte';
	import { DataTable, PriceCell, type DataTableColumn } from '$lib/ui';
	import type { RequestCardDto } from '$lib/types/request';

	/** Composition of the request from the mockup. Money columns appear for a role with prices only. */
	let { request, canSeePrices }: { request: RequestCardDto; canSeePrices: boolean } = $props();

	const MONEY: DataTableColumn[] = [
		{ key: 'unitPriceMinor', label: 'Цена', align: 'end' },
		{ key: 'lineTotalMinor', label: 'Сумма', align: 'end' }
	];
	// A role without prices still sees what its own agency charges the client (tech.md P7).
	const AGENCY: DataTableColumn[] = [{ key: 'agencyUnitPriceMinor', label: 'Цена', align: 'end' }];

	const columns = $derived<DataTableColumn[]>([
		{ key: 'productTitle', label: 'Позиция' },
		{ key: 'options', label: 'Параметры' },
		{ key: 'qty', label: 'Кол-во', align: 'end' },
		...(canSeePrices ? MONEY : AGENCY)
	]);

	const rows = $derived([...request.items]);
</script>

<DataTable
	{columns}
	{rows}
	total={rows.length}
	query={{ page: 1, perPage: rows.length || 1 }}
	onQueryChange={() => {}}
	emptyTitle="В заявке нет позиций"
>
	{#snippet cell(row, column)}
		{#if column.key === 'productTitle'}
			<span class="flex flex-col">
				<span>{row.productTitle}</span>
				<span class="text-xs text-fg-muted">{row.sku}</span>
			</span>
		{:else if column.key === 'options'}
			<span class="text-sm text-fg-muted">
				{[row.sizeCode, row.materialTitle, ...row.options.map((option) => option.title)].join(
					' · '
				)}{#if row.engraving}
					· гравировка «{row.engraving}»{/if}
			</span>
		{:else if column.key === 'qty'}
			{row.qty} шт
		{:else if column.key === 'agencyUnitPriceMinor'}
			<PriceCell valueMinor={row.agencyUnitPriceMinor} />
		{:else if column.key === 'unitPriceMinor'}
			<PricePair agencyMinor={row.agencyUnitPriceMinor} purchaseMinor={row.unitPriceMinor} />
		{:else}
			<PriceCell valueMinor={row.lineTotalMinor} />
		{/if}
	{/snippet}
</DataTable>
