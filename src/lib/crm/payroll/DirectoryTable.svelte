<script lang="ts" generics="TRow extends { id: number; isActive: boolean }">
	import { enhance } from '$app/forms';
	import { Button, DataTable, TONE_CLASS, withToast, type DataTableColumn } from '$lib/ui';
	import type { Snippet } from 'svelte';

	/*
	 * The crew and the works are short lists with the same actions: edit, switch off, switch on.
	 * The page gives the columns of its own rows; the status and the actions are drawn here.
	 */
	let {
		rows,
		columns,
		canManage,
		emptyTitle,
		statusTitle,
		nameOf,
		onEdit,
		own
	}: {
		rows: readonly TRow[];
		columns: readonly DataTableColumn[];
		canManage: boolean;
		emptyTitle: string;
		/** How the page words an active and a switched-off row. */
		statusTitle: { readonly on: string; readonly off: string };
		nameOf: (row: TRow) => string;
		onEdit: (row: TRow) => void;
		/** Cells of the page's own columns. */
		own: Snippet<[TRow, DataTableColumn]>;
	} = $props();

	const allColumns = $derived<DataTableColumn[]>([
		...columns,
		{ key: 'isActive', label: 'Статус' },
		...(canManage ? [{ key: 'actions', label: 'Действия', align: 'end' as const }] : [])
	]);
	// Every row is on the screen: the lists of a workshop are a few dozen lines.
	const query = $derived({ page: 1, perPage: Math.max(1, rows.length) });
</script>

<DataTable
	columns={allColumns}
	{rows}
	total={rows.length}
	{query}
	onQueryChange={() => undefined}
	{emptyTitle}
>
	{#snippet cell(row: TRow, column: DataTableColumn)}
		{#if column.key === 'isActive'}
			<span
				data-testid="directory-status"
				class={[
					'inline-flex rounded-pill px-3 py-1 text-xs',
					TONE_CLASS[row.isActive ? 'success' : 'neutral']
				]}
			>
				{row.isActive ? statusTitle.on : statusTitle.off}
			</span>
		{:else if column.key === 'actions'}
			<div class="flex flex-wrap justify-end gap-2">
				<Button variant="secondary" size="sm" onclick={() => onEdit(row)}>Изменить</Button>
				<form
					method="POST"
					action={row.isActive ? '?/disable' : '?/enable'}
					use:enhance={withToast({
						success: row.isActive ? `Выключено: ${nameOf(row)}` : `Включено: ${nameOf(row)}`
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
		{:else}
			{@render own(row, column)}
		{/if}
	{/snippet}
</DataTable>
