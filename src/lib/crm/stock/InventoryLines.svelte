<script lang="ts">
	import { DataTable, NumberInput, type DataTableColumn } from '$lib/ui';
	import { STOCK_MOVE_MAX, type InventoryLineDto } from '$lib/types/crm-stock';
	import { signed } from './labels';

	/**
	 * Lines of an inventory. A draft that may be edited shows a field per line named
	 * `actual.<lineId>`; anything else reads the stored figures.
	 */
	let { lines, editable }: { lines: readonly InventoryLineDto[]; editable: boolean } = $props();

	const columns: DataTableColumn[] = [
		{ key: 'code', label: 'Код' },
		{ key: 'title', label: 'Позиция' },
		{ key: 'expected', label: 'По учёту', align: 'end' },
		{ key: 'actual', label: 'Факт', align: 'end' },
		{ key: 'diff', label: 'Расхождение', align: 'end' }
	];
	// Every line is on the screen: the count is one sheet, paging would split it.
	const query = $derived({ page: 1, perPage: Math.max(1, lines.length) });
	const delta = (line: InventoryLineDto) => line.actualQty - line.expectedQty;
</script>

<DataTable
	{columns}
	rows={lines}
	total={lines.length}
	{query}
	onQueryChange={() => undefined}
	emptyTitle="В инвентаризации нет строк"
>
	{#snippet cell(line: InventoryLineDto, column: DataTableColumn)}
		{#if column.key === 'code'}
			<span class="text-fg-muted">{line.code}</span>
		{:else if column.key === 'title'}
			<div>{line.title}</div>
			{#if line.colorTitle}<div class="text-xs text-fg-muted">{line.colorTitle}</div>{/if}
		{:else if column.key === 'expected'}
			{line.expectedQty} <span class="text-xs text-fg-muted">{line.unitTitle}</span>
		{:else if column.key === 'actual'}
			{#if editable}
				<div class="ms-auto w-28">
					<NumberInput
						name={`actual.${line.id}`}
						placeholder="Введите факт"
						value={line.actualQty}
						min={0}
						max={STOCK_MOVE_MAX}
						required
					/>
				</div>
			{:else}
				{line.actualQty}
			{/if}
		{:else if column.key === 'diff'}
			<span class={delta(line) === 0 ? 'text-fg-muted' : 'font-medium text-danger'}>
				{delta(line) === 0 ? '0' : signed(delta(line))}
			</span>
		{/if}
	{/snippet}
</DataTable>
