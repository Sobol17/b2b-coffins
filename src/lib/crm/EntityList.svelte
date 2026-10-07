<script lang="ts" generics="TRow extends { id: number | string }">
	import { EmptyState, Pagination } from '$lib/ui';
	import type { ListQuery } from '$lib/types/list';
	import type { Snippet } from 'svelte';

	/*
	 * A list of people or records: who it is on the left, what to do with it on the right. A table
	 * stays for rows a person compares by column (money, quantities, dates); a short directory with
	 * buttons in every line reads better as a list and does not scroll sideways on a phone.
	 */
	let {
		rows,
		emptyTitle = 'Ничего не найдено',
		paging,
		item,
		actions
	}: {
		rows: readonly TRow[];
		emptyTitle?: string;
		/** Server paging, when the list has it. A list without it shows every row. */
		paging?:
			{ total: number; query: ListQuery; onQueryChange: (next: ListQuery) => void } | undefined;
		item: Snippet<[TRow]>;
		actions?: Snippet<[TRow]> | undefined;
	} = $props();
</script>

<div class="flex flex-col gap-3">
	{#if rows.length === 0}
		<EmptyState title={emptyTitle} />
	{:else}
		<ul class="divide-y divide-border">
			{#each rows as row (row.id)}
				<li
					data-testid="data-table-row"
					class="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5 first:pt-0 last:pb-0"
				>
					<div class="min-w-0 flex-1 basis-64">{@render item(row)}</div>
					{#if actions}
						<div class="flex flex-wrap items-center gap-2">{@render actions(row)}</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if paging}
		<Pagination total={paging.total} query={paging.query} onQueryChange={paging.onQueryChange} />
	{/if}
</div>
