<script lang="ts">
	import { resolve } from '$app/paths';
	import { DataTable, TONE_CLASS, type DataTableColumn } from '$lib/ui';
	import type { BomDeficitRowDto } from '$lib/types/crm-bom';
	import { milliWithUnit } from './labels';

	/** Components the production queue needs against the shelf (C9): the deficit rows come first. */
	let { rows }: { rows: readonly BomDeficitRowDto[] } = $props();

	const columns: DataTableColumn[] = [
		{ key: 'component', label: 'Комплектующее' },
		{ key: 'need', label: 'Потребность', align: 'end' },
		{ key: 'balance', label: 'На складе', align: 'end' },
		{ key: 'deficit', label: 'Дефицит', align: 'end' }
	];
	const keyed = $derived(rows.map((row) => ({ ...row, id: row.componentId })));
	// The list is one sheet: paging would hide a deficit behind a click.
	const query = $derived({ page: 1, perPage: Math.max(1, rows.length) });
	type Row = BomDeficitRowDto & { id: number };
</script>

<DataTable
	{columns}
	rows={keyed}
	total={keyed.length}
	{query}
	onQueryChange={() => undefined}
	emptyTitle="Заявкам в работе комплектующие не нужны"
>
	{#snippet cell(row: Row, column: DataTableColumn)}
		{#if column.key === 'component'}
			<a class="text-link" href={resolve(`/crm/stock/${row.componentId}`)}>{row.title}</a>
			<div class="text-xs text-fg-muted">{row.code}</div>
		{:else if column.key === 'need'}
			{milliWithUnit(row.needMilli, row.unitTitle)}
		{:else if column.key === 'balance'}
			<span class={row.balance < 0 ? 'text-danger' : ''}>{row.balance} {row.unitTitle}</span>
		{:else if column.key === 'deficit'}
			{#if row.deficitMilli > 0}
				<span
					class={['rounded-pill px-2 py-0.5 text-xs font-medium', TONE_CLASS.danger]}
					data-testid="deficit-qty"
				>
					{milliWithUnit(row.deficitMilli, row.unitTitle)}
				</span>
			{:else}
				<span class="text-fg-muted">Хватает</span>
			{/if}
		{/if}
	{/snippet}
</DataTable>
