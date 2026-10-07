<script lang="ts">
	import { resolve } from '$app/paths';
	import EntityList from '$lib/crm/EntityList.svelte';
	import { TONE_CLASS, buttonVariants } from '$lib/ui';
	import type { InventoryRowDto } from '$lib/types/crm-stock';
	import type { ListQuery } from '$lib/types/list';
	import { formatDateTime } from '$lib/utils/format';
	import { INVENTORY_STATUS_TITLE, KIND_PLURAL } from './labels';

	let {
		rows,
		total,
		query,
		onQueryChange,
		timeZone
	}: {
		rows: readonly InventoryRowDto[];
		total: number;
		query: ListQuery;
		onQueryChange: (next: ListQuery) => void;
		timeZone: string;
	} = $props();
</script>

<EntityList {rows} paging={{ total, query, onQueryChange }} emptyTitle="Инвентаризаций ещё не было">
	{#snippet item(row: InventoryRowDto)}
		<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
			<span class="font-medium">№ {row.id} · {KIND_PLURAL[row.kind]}</span>
			<span
				class={[
					'rounded-pill px-2.5 py-0.5 text-xs',
					row.status === 'draft' ? TONE_CLASS.progress : TONE_CLASS.success
				]}
			>
				{INVENTORY_STATUS_TITLE[row.status]}
			</span>
		</div>
		<div class="text-sm text-fg-muted">
			Расхождений {row.diffCount} из {row.lineCount}
		</div>
		<div class="text-xs text-fg-faint">
			Открыл {row.createdByName}, {formatDateTime(row.createdAt, timeZone)}{row.appliedAt === null
				? ''
				: ` · проведена ${formatDateTime(row.appliedAt, timeZone)}`}
		</div>
	{/snippet}
	{#snippet actions(row: InventoryRowDto)}
		<a
			class={buttonVariants({ variant: 'secondary', size: 'sm' })}
			href={resolve(`/crm/stock/inventories/${row.id}`)}
		>
			Открыть
		</a>
	{/snippet}
</EntityList>
