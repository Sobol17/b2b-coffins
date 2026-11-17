<script lang="ts" generics="TRow extends { id: number }">
	import { DataTable, type DataTableColumn } from '$lib/ui';
	import type { Snippet } from 'svelte';

	/* A report table shows every row of its range: nothing to page or sort. */
	let {
		rows,
		columns,
		emptyTitle,
		cell,
		footer
	}: {
		rows: readonly TRow[];
		columns: readonly DataTableColumn[];
		emptyTitle: string;
		cell: Snippet<[TRow, DataTableColumn]>;
		footer?: Snippet<[DataTableColumn]> | undefined;
	} = $props();

	const query = $derived({ page: 1, perPage: Math.max(1, rows.length) });
</script>

<DataTable
	{columns}
	{rows}
	total={rows.length}
	{query}
	onQueryChange={() => undefined}
	{emptyTitle}
	{cell}
	{footer}
/>
