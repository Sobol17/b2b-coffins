<script lang="ts">
	import { enhance } from '$app/forms';
	import EntityList from '$lib/crm/EntityList.svelte';
	import { Button, TONE_CLASS, withToast } from '$lib/ui';
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
</script>

<EntityList {rows} paging={{ total, query, onQueryChange }} emptyTitle="Записей нет">
	{#snippet item(row: DictItemDto)}
		<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
			<span class="font-medium">{row.title}</span>
			<span
				data-testid="dict-status"
				class={[
					'inline-flex rounded-pill px-2.5 py-0.5 text-xs',
					TONE_CLASS[row.isActive ? 'success' : 'neutral']
				]}
			>
				{row.isActive ? 'Используется' : 'Выключена'}
			</span>
		</div>
		<div class="text-xs text-fg-faint">
			Код <code class="font-mono">{row.code}</code> · порядок {row.sortOrder}
		</div>
	{/snippet}
	{#snippet actions(row: DictItemDto)}
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
	{/snippet}
</EntityList>
