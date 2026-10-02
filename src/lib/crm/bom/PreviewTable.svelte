<script lang="ts">
	import { DataTable, TONE_CLASS, type DataTableColumn } from '$lib/ui';
	import type { BomPreviewRowDto } from '$lib/types/crm-bom';
	import { formatMilli } from '$lib/utils/milli';
	import { ROW_ERROR_TITLE } from './labels';

	/** Rows of an uploaded norm file with the error report (C9): broken rows come first. */
	let { rows }: { rows: readonly BomPreviewRowDto[] } = $props();

	const columns: DataTableColumn[] = [
		{ key: 'line', label: 'Строка', align: 'end' },
		{ key: 'variant', label: 'Артикул варианта' },
		{ key: 'component', label: 'Код комплектующего' },
		{ key: 'qty', label: 'Норма на единицу', align: 'end' },
		{ key: 'errors', label: 'Проверка' }
	];
	// The table wants a row id; the line of the file is one.
	const keyed = $derived(rows.map((row) => ({ ...row, id: row.line })));
	// The preview is one sheet already cut by the server, there is nothing to page.
	const query = $derived({ page: 1, perPage: Math.max(1, rows.length) });
	type Row = BomPreviewRowDto & { id: number };
</script>

<DataTable
	{columns}
	rows={keyed}
	total={keyed.length}
	{query}
	onQueryChange={() => undefined}
	emptyTitle="В файле нет строк"
>
	{#snippet cell(row: Row, column: DataTableColumn)}
		{#if column.key === 'line'}
			<span class="text-fg-muted">{row.line}</span>
		{:else if column.key === 'variant'}
			{row.variantSku || '—'}
		{:else if column.key === 'component'}
			{row.componentCode || '—'}
		{:else if column.key === 'qty'}
			{row.qtyPerUnitMilli === null ? row.qtyText || '—' : formatMilli(row.qtyPerUnitMilli)}
		{:else if column.key === 'errors'}
			<div class="flex flex-wrap gap-1" data-testid="bom-row-errors">
				{#each row.errors as error (error)}
					<span class={['rounded-pill px-2 py-0.5 text-xs', TONE_CLASS.danger]}>
						{ROW_ERROR_TITLE[error]}
					</span>
				{:else}
					<span class="text-fg-muted">Без ошибок</span>
				{/each}
			</div>
		{/if}
	{/snippet}
</DataTable>
