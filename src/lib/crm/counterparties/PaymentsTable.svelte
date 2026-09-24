<script lang="ts">
	import { PAYMENT_METHOD_TITLE } from '$lib/crm/labels';
	import { DataTable, PriceCell, type DataTableColumn } from '$lib/ui';
	import type { CrmPaymentMarkDto } from '$lib/types/crm-counterparty';
	import type { ListQuery } from '$lib/types/list';
	import { formatDate } from '$lib/utils/format';

	/** The registry of payment marks the debt indicator is counted from (tech.md v1.39). */
	let {
		rows,
		total,
		query,
		onQueryChange,
		timeZone
	}: {
		rows: readonly CrmPaymentMarkDto[];
		total: number;
		query: ListQuery;
		onQueryChange: (next: ListQuery) => void;
		timeZone: string;
	} = $props();

	const columns: DataTableColumn[] = [
		{ key: 'paidAt', label: 'Дата' },
		{ key: 'requestNumber', label: 'Заявка' },
		{ key: 'method', label: 'Способ' },
		{ key: 'createdByName', label: 'Отметил' },
		{ key: 'amountMinor', label: 'Сумма, ₽', align: 'end' }
	];
</script>

<DataTable {columns} {rows} {total} {query} {onQueryChange} emptyTitle="Отметок оплаты пока нет">
	{#snippet cell(row: CrmPaymentMarkDto, column: DataTableColumn)}
		{#if column.key === 'paidAt'}
			{formatDate(row.paidAt, timeZone)}
		{:else if column.key === 'requestNumber'}
			<div>{row.requestNumber}</div>
			{#if row.comment}<div class="text-xs text-fg-faint">{row.comment}</div>{/if}
		{:else if column.key === 'method'}
			{PAYMENT_METHOD_TITLE[row.method]}
		{:else if column.key === 'createdByName'}
			{row.createdByName}
		{:else if column.key === 'amountMinor'}
			<PriceCell valueMinor={row.amountMinor} />
		{/if}
	{/snippet}
</DataTable>
