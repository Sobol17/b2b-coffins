<script lang="ts" module>
	export interface DataTableColumn {
		readonly key: string;
		readonly label: string;
		readonly sortable?: boolean;
		readonly align?: 'start' | 'end';
	}
</script>

<script lang="ts" generics="TRow extends { id: number | string }">
	import * as Table from '$lib/ui/base/table/index.js';
	import { buttonVariants } from '$lib/ui/base/button/index.js';
	import EmptyState from './EmptyState.svelte';
	import Pagination from './Pagination.svelte';
	import type { ListQuery } from '$lib/types/list';
	import type { Snippet } from 'svelte';

	/*
	 * The one registry table of the app (tech.md 4.3). Paging and sorting are server side: the
	 * component reports a new ListQuery and never slices rows itself.
	 */
	let {
		columns,
		rows,
		total,
		query,
		onQueryChange,
		exportUrl,
		emptyTitle = 'Ничего не найдено',
		cell
	}: {
		columns: readonly DataTableColumn[];
		rows: readonly TRow[];
		total: number;
		query: ListQuery;
		onQueryChange: (next: ListQuery) => void;
		exportUrl?: string | undefined;
		emptyTitle?: string;
		cell: Snippet<[TRow, DataTableColumn]>;
	} = $props();

	function toggleSort(column: DataTableColumn): void {
		if (column.sortable !== true) return;
		const sameColumn = query.sort === column.key;
		onQueryChange({
			...query,
			page: 1,
			sort: column.key,
			dir: sameColumn && query.dir === 'asc' ? 'desc' : 'asc'
		});
	}
</script>

<div data-slot="data-table" class="flex flex-col gap-3">
	{#if exportUrl}
		<div class="flex justify-end">
			<!-- The export link carries a query string, so it is a server-built url, not a route pattern. -->
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<a
				href={exportUrl}
				class={buttonVariants({ variant: 'secondary' })}
				data-testid="data-table-export"
			>
				Выгрузить XLSX
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</div>
	{/if}

	<div class="overflow-x-auto rounded-card border border-border">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					{#each columns as column (column.key)}
						<Table.Head
							class={column.align === 'end' ? 'text-right' : undefined}
							aria-sort={column.sortable && query.sort === column.key
								? query.dir === 'asc'
									? 'ascending'
									: 'descending'
								: undefined}
						>
							{#if column.sortable}
								<button
									type="button"
									class="inline-flex items-center gap-1 font-medium"
									onclick={() => toggleSort(column)}
								>
									{column.label}
									{#if query.sort === column.key}
										<span aria-hidden="true">{query.dir === 'asc' ? '↑' : '↓'}</span>
									{/if}
								</button>
							{:else}
								{column.label}
							{/if}
						</Table.Head>
					{/each}
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each rows as row (row.id)}
					<Table.Row data-testid="data-table-row">
						{#each columns as column (column.key)}
							<Table.Cell class={column.align === 'end' ? 'text-right' : undefined}>
								{@render cell(row, column)}
							</Table.Cell>
						{/each}
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>

	{#if rows.length === 0}
		<EmptyState title={emptyTitle} />
	{/if}

	<Pagination {total} {query} {onQueryChange} />
</div>
