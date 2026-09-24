<script lang="ts">
	import { DataTable, PriceCell, StatusBadge, type DataTableColumn } from '$lib/ui';
	import type { ListQuery } from '$lib/types/list';
	import type { RequestListItemDto } from '$lib/types/request';
	import { formatDate } from '$lib/utils/format';

	let {
		rows,
		total,
		query,
		onQueryChange,
		timeZone
	}: {
		rows: readonly RequestListItemDto[];
		total: number;
		query: ListQuery;
		onQueryChange: (next: ListQuery) => void;
		timeZone: string;
	} = $props();

	const columns: DataTableColumn[] = [
		{ key: 'number', label: 'Заявка' },
		{ key: 'submittedAt', label: 'Отправлена' },
		{ key: 'status', label: 'Статус' },
		{ key: 'totalMinor', label: 'Сумма, ₽', align: 'end' },
		{ key: 'paidMinor', label: 'Оплачено, ₽', align: 'end' }
	];
</script>

<DataTable {columns} {rows} {total} {query} {onQueryChange} emptyTitle="Заявок пока нет">
	{#snippet cell(row: RequestListItemDto, column: DataTableColumn)}
		{#if column.key === 'number'}
			<div>{row.number}</div>
			<div class="text-xs text-fg-faint">{row.firstItemTitle ?? '—'} · {row.unitCount} шт.</div>
		{:else if column.key === 'submittedAt'}
			{row.submittedAt ? formatDate(row.submittedAt, timeZone) : '—'}
		{:else if column.key === 'status'}
			<StatusBadge status={row.status} />
		{:else if column.key === 'totalMinor'}
			<PriceCell valueMinor={row.totalMinor} />
		{:else if column.key === 'paidMinor'}
			<PriceCell valueMinor={row.paidMinor} />
		{/if}
	{/snippet}
</DataTable>
