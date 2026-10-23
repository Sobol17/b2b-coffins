<script lang="ts">
	import { page } from '$app/state';
	import { FINANCE_SOURCE_TITLE, signedAmount } from '$lib/crm/finance/labels';
	import { roubles } from '$lib/crm/payroll/labels';
	import ReportTable from '$lib/crm/ReportTable.svelte';
	import { kindOf } from '$lib/domain/finance/summary';
	import type { FinanceSourceTotalDto, FinanceSummaryDto } from '$lib/types/finance';
	import type { DataTableColumn } from '$lib/ui';

	/* Where the money of the period came from and went to; a row opens the feed of its source. */
	let { summary }: { summary: FinanceSummaryDto } = $props();

	const columns: DataTableColumn[] = [
		{ key: 'title', label: 'Источник' },
		{ key: 'count', label: 'Операций', align: 'end' },
		{ key: 'amount', label: 'Сумма', align: 'end' },
		{ key: 'share', label: 'Доля', align: 'end' }
	];
	const rows = $derived(summary.bySource.map((row, index) => ({ ...row, id: index })));
	type Row = (typeof rows)[number];

	/** The share inside its own kind: income sources add up to 100%, expense sources too. */
	function share(row: FinanceSourceTotalDto): string {
		const whole = kindOf(row.source) === 'income' ? summary.incomeMinor : summary.expenseMinor;
		const part = kindOf(row.source) === 'income' ? row.signedMinor : -row.signedMinor;
		return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '';
	}

	function hrefOf(row: FinanceSourceTotalDto): string {
		const url = new URL(page.url);
		url.searchParams.set('source', row.source);
		url.searchParams.delete('kind');
		url.searchParams.delete('page');
		return `${url.pathname}${url.search}#finance-feed`;
	}
</script>

<ReportTable {rows} {columns} emptyTitle="За период операций нет">
	{#snippet cell(row: Row, column: DataTableColumn)}
		{#if column.key === 'title'}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- same page, new query -->
			<a class="text-link underline hover:text-link-hover" href={hrefOf(row)}>
				{FINANCE_SOURCE_TITLE[row.source]}
			</a>
		{:else if column.key === 'count'}
			<span class="tabular-nums">{row.count}</span>
		{:else if column.key === 'amount'}
			<span
				class="tabular-nums"
				class:text-success={row.signedMinor > 0}
				class:text-danger={row.signedMinor < 0}
			>
				{signedAmount(row.signedMinor, roubles)}
			</span>
		{:else}
			<span class="tabular-nums">{share(row)}</span>
		{/if}
	{/snippet}
</ReportTable>
