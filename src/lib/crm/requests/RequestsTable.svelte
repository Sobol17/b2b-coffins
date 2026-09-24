<script lang="ts">
	import { resolve } from '$app/paths';
	import { FLAG_TITLE, PRIORITY_TITLE, STOCK_TITLE } from './labels';
	import { DataTable, PriceCell, StatusBadge, TONE_CLASS, type DataTableColumn } from '$lib/ui';
	import type { CrmRequestListItemDto } from '$lib/types/crm-request';
	import type { ListQuery } from '$lib/types/list';
	import { formatDate, formatDateTime } from '$lib/utils/format';

	let {
		rows,
		total,
		query,
		onQueryChange,
		exportUrl,
		timeZone,
		withMoney
	}: {
		rows: readonly CrmRequestListItemDto[];
		total: number;
		query: ListQuery;
		onQueryChange: (next: ListQuery) => void;
		exportUrl: string;
		timeZone: string;
		withMoney: boolean;
	} = $props();

	const columns = $derived<DataTableColumn[]>([
		{ key: 'number', label: 'Заявка', sortable: true },
		{ key: 'status', label: 'Статус' },
		{ key: 'counterparty', label: 'Контрагент' },
		{ key: 'deliveryAt', label: 'Срок', sortable: true },
		{ key: 'submittedAt', label: 'Отправлена', sortable: true },
		...(withMoney
			? [{ key: 'total', label: 'Сумма, ₽', sortable: true, align: 'end' as const }]
			: [])
	]);
</script>

<DataTable {columns} {rows} {total} {query} {onQueryChange} {exportUrl} emptyTitle="Заявок нет">
	{#snippet cell(row: CrmRequestListItemDto, column: DataTableColumn)}
		{#if column.key === 'number'}
			<a class="text-link hover:text-link-hover" href={resolve(`/crm/requests/${row.id}`)}
				>{row.number}</a
			>
			<div class="text-xs text-fg-faint">{row.firstItemTitle ?? '—'} · {row.unitCount} шт.</div>
			{#if row.priority === 'urgent' || row.flags.length > 0}
				<div class="mt-1 flex flex-wrap gap-1">
					{#each [...(row.priority === 'urgent' ? [PRIORITY_TITLE.urgent] : []), ...row.flags.map((flag) => FLAG_TITLE[flag])] as tag (tag)}
						<span class={['rounded-pill px-2 py-0.5 text-xs', TONE_CLASS.warning]}>{tag}</span>
					{/each}
				</div>
			{/if}
		{:else if column.key === 'status'}
			<StatusBadge status={row.status} />
		{:else if column.key === 'counterparty'}
			{row.isStockRequest ? STOCK_TITLE : (row.counterpartyName ?? '—')}
		{:else if column.key === 'deliveryAt'}
			{row.deliveryAt ? formatDateTime(row.deliveryAt, timeZone) : '—'}
		{:else if column.key === 'submittedAt'}
			{row.submittedAt ? formatDate(row.submittedAt, timeZone) : '—'}
		{:else if column.key === 'total'}
			<PriceCell valueMinor={row.totalMinor} />
		{/if}
	{/snippet}
</DataTable>
