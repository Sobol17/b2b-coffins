<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, DataTable, TONE_CLASS, withToast, type DataTableColumn } from '$lib/ui';
	import type { DictItemDto } from '$lib/types/crm';
	import type { ListQuery } from '$lib/types/list';

	let {
		rows,
		total,
		query,
		onQueryChange,
		onEdit
	}: {
		rows: readonly DictItemDto[];
		total: number;
		query: ListQuery;
		onQueryChange: (next: ListQuery) => void;
		onEdit: (item: DictItemDto) => void;
	} = $props();

	const columns: DataTableColumn[] = [
		{ key: 'title', label: 'Название', sortable: true },
		{ key: 'code', label: 'Код', sortable: true },
		{ key: 'sortOrder', label: 'Порядок', sortable: true },
		{ key: 'isActive', label: 'Статус' },
		{ key: 'actions', label: 'Действия', align: 'end' }
	];
</script>

<DataTable {columns} {rows} {total} {query} {onQueryChange} emptyTitle="Записей нет">
	{#snippet cell(row: DictItemDto, column: DataTableColumn)}
		{#if column.key === 'title'}
			{row.title}
		{:else if column.key === 'code'}
			<code class="font-mono text-sm">{row.code}</code>
		{:else if column.key === 'sortOrder'}
			{row.sortOrder}
		{:else if column.key === 'isActive'}
			<span
				data-testid="dict-status"
				class={[
					'inline-flex rounded-pill px-3 py-1 text-xs',
					TONE_CLASS[row.isActive ? 'success' : 'neutral']
				]}
			>
				{row.isActive ? 'Используется' : 'Выключена'}
			</span>
		{:else if column.key === 'actions'}
			<div class="flex flex-wrap justify-end gap-2">
				<Button variant="secondary" size="sm" onclick={() => onEdit(row)}>Изменить</Button>
				<form
					method="POST"
					action={row.isActive ? '?/disable' : '?/enable'}
					use:enhance={withToast({
						success: row.isActive ? `Выключена: ${row.title}` : `Включена: ${row.title}`
					})}
				>
					<input type="hidden" name="id" value={row.id} />
					<Button
						type="submit"
						variant="ghost"
						size="sm"
						class={row.isActive ? 'text-danger' : undefined}
					>
						{row.isActive ? 'Выключить' : 'Включить'}
					</Button>
				</form>
			</div>
		{/if}
	{/snippet}
</DataTable>
