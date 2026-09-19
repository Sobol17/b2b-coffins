<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { DataTable, type DataTableColumn } from '$lib/ui';
	import type { ListQuery } from '$lib/types/list';
	import type { NotificationFeedItemDto } from '$lib/types/notifications';
	import { formatDateTime } from '$lib/utils/format';
	import { EVENT_LABEL } from './labels';
	import { markFeedRead } from './read-feed';

	let {
		rows,
		total,
		query,
		onQueryChange,
		timeZone
	}: {
		rows: readonly NotificationFeedItemDto[];
		total: number;
		query: ListQuery;
		onQueryChange: (next: ListQuery) => void;
		timeZone: string;
	} = $props();

	const columns: DataTableColumn[] = [
		{ key: 'event', label: 'Событие' },
		{ key: 'request', label: 'Заявка' },
		{ key: 'state', label: 'Прочитано' }
	];

	// Opening the list is the reading: the page marks what it shows, then reloads so the bell agrees.
	$effect(() => {
		const ids = rows.filter((row) => !row.isRead).map((row) => row.id);
		if (ids.length === 0) return;
		void markFeedRead(ids).then((left) => {
			if (left !== null) void invalidateAll();
		});
	});
</script>

<DataTable {columns} {rows} {total} {query} {onQueryChange} emptyTitle="Уведомлений пока не было">
	{#snippet cell(row: NotificationFeedItemDto, column: DataTableColumn)}
		{#if column.key === 'event'}
			<div>{EVENT_LABEL[row.eventKey].title}</div>
			<div class="text-xs text-fg-faint">{formatDateTime(row.createdAt, timeZone)}</div>
		{:else if column.key === 'request'}
			{#if row.requestId !== null && row.requestNumber !== null}
				<a class="underline" href={resolve(`/portal/requests/${row.requestId}`)}>
					{row.requestNumber}
				</a>
			{:else}
				—
			{/if}
		{:else if column.key === 'state'}
			<span data-testid="feed-state" class="text-sm text-fg-muted">
				{row.isRead ? 'Прочитано' : 'Новое'}
			</span>
		{/if}
	{/snippet}
</DataTable>
