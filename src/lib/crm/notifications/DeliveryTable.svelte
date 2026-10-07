<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		DELIVERY_LABEL,
		DELIVERY_TONE,
		EVENT_LABEL,
		FAILURE_LABEL
	} from '$lib/notifications/labels';
	import { DataTable, TONE_CLASS, type DataTableColumn } from '$lib/ui';
	import type { ListQuery } from '$lib/types/list';
	import type { NotificationDeliveryDto } from '$lib/types/push';
	import { formatDateTime } from '$lib/utils/format';

	let {
		rows,
		total,
		query,
		onQueryChange,
		timeZone
	}: {
		rows: readonly NotificationDeliveryDto[];
		total: number;
		query: ListQuery;
		onQueryChange: (next: ListQuery) => void;
		timeZone: string;
	} = $props();

	const columns: DataTableColumn[] = [
		{ key: 'userName', label: 'Кому' },
		{ key: 'createdAt', label: 'Событие' },
		{ key: 'request', label: 'Заявка' },
		{ key: 'status', label: 'Доставка' }
	];
</script>

<DataTable {columns} {rows} {total} {query} {onQueryChange} emptyTitle="Пушей пока не было">
	{#snippet cell(row: NotificationDeliveryDto, column: DataTableColumn)}
		{#if column.key === 'userName'}
			{row.userName}
		{:else if column.key === 'createdAt'}
			<div>{EVENT_LABEL[row.eventKey].title}</div>
			<div class="text-xs text-fg-faint">{formatDateTime(row.createdAt, timeZone)}</div>
		{:else if column.key === 'request'}
			{#if row.requestId !== null && row.requestNumber !== null}
				<a class="underline" href={resolve(`/crm/requests/${row.requestId}`)}>
					{row.requestNumber}
				</a>
			{:else}
				—
			{/if}
		{:else if column.key === 'status'}
			<span
				data-testid="delivery-status"
				class={[
					'inline-flex rounded-pill px-3 py-1 text-xs',
					TONE_CLASS[DELIVERY_TONE[row.status]]
				]}
			>
				{DELIVERY_LABEL[row.status]}
			</span>
			{#if row.sentAt}
				<div class="pt-1 text-xs text-fg-faint">{formatDateTime(row.sentAt, timeZone)}</div>
			{:else if row.failure}
				<div data-testid="delivery-failure" class="pt-1 text-xs text-fg-faint">
					{FAILURE_LABEL[row.failure]}. Попыток: {row.attempts}
				</div>
			{:else if row.attempts > 0}
				<div class="pt-1 text-xs text-fg-faint">Попыток: {row.attempts}</div>
			{/if}
		{/if}
	{/snippet}
</DataTable>
