<script lang="ts">
	import { resolve } from '$app/paths';
	import { roubles } from '$lib/crm/payroll/labels';
	import ReportFilters from '$lib/crm/reports/ReportFilters.svelte';
	import StatTile from '$lib/crm/reports/StatTile.svelte';
	import ReportTable from '$lib/crm/ReportTable.svelte';
	import { Card, ErrorState, REQUEST_STATUS_META, type DataTableColumn } from '$lib/ui';
	import type { DashboardDto } from '$lib/types/crm-reports';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const query = $derived(`?from=${data.filters.from}&to=${data.filters.to}`);
	const columns: DataTableColumn[] = [
		{ key: 'title', label: 'Название' },
		{ key: 'qty', label: 'Штук', align: 'end' },
		{ key: 'total', label: 'Сумма', align: 'end' }
	];
	const counterparties = $derived(
		(data.report?.topCounterparties ?? []).map((row) => ({
			id: row.counterpartyId,
			title: row.title,
			qty: row.qty,
			total: row.totalMinor
		}))
	);
	const models = $derived(
		(data.report?.topModels ?? []).map((row) => ({
			id: row.modelId,
			title: row.title,
			qty: row.qty,
			total: row.linesTotalMinor
		}))
	);
	type Row = (typeof counterparties)[number];
	const statuses = (counts: DashboardDto['statusCounts']) =>
		Object.entries(counts) as [keyof DashboardDto['statusCounts'], number][];
</script>

<svelte:head><title>Отчёты</title></svelte:head>

<div>
	<h1 class="mb-2 text-3xl">Сводка</h1>
	<p class="max-w-2xl text-fg-muted">
		Цифры мастерской за выбранные даты. Долг, заявки и склад показаны на сейчас и от периода не
		зависят.
	</p>
</div>
<Card.Root>
	<Card.Content><ReportFilters filters={data.filters} today={data.today} /></Card.Content>
</Card.Root>

{#if data.problem}
	<div data-testid="report-problem"><ErrorState title={data.problem} /></div>
{:else if data.report}
	{@const r = data.report}
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<StatTile
			testid="tile-sales"
			label="Продажи за период"
			value={roubles(r.sales.totalMinor)}
			hint={`Заявок: ${r.sales.requestCount}, штук: ${r.sales.qty}`}
			href={`${resolve('/crm/reports/sales')}${query}`}
		/>
		<StatTile testid="tile-paid" label="Оплачено по ним" value={roubles(r.sales.paidMinor)} />
		<StatTile
			testid="tile-debt"
			label="Долг контрагентов сейчас"
			value={roubles(r.debtMinor)}
			href={resolve('/crm/counterparties')}
		/>
		<StatTile
			testid="tile-payroll"
			label="Начислено бригаде"
			value={roubles(r.payrollAccruedMinor)}
			href={`${resolve('/crm/payroll/reports')}${query}`}
		/>
		<StatTile
			testid="tile-charity"
			label="Начислено фонду за период"
			value={roubles(r.charityAccruedInRangeMinor)}
			href={`${resolve('/crm/reports/charity')}${query}`}
		/>
		<StatTile
			testid="tile-remainder"
			label="К перечислению фонду"
			value={roubles(r.charityRemainderMinor)}
		/>
		<StatTile
			testid="tile-threshold"
			label="Позиций ниже порога"
			value={String(r.belowThresholdCount)}
			href={`${resolve('/crm/stock')}?belowThreshold=true`}
		/>
	</div>

	<Card.Root>
		<Card.Content class="flex flex-col gap-3">
			<h2 class="text-2xl">Заявки сейчас</h2>
			<dl class="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="status-counts">
				{#each statuses(r.statusCounts) as [status, count] (status)}
					<div>
						<dt class="text-sm text-fg-muted">{REQUEST_STATUS_META[status].label}</dt>
						<dd class="text-xl tabular-nums">{count}</dd>
					</div>
				{/each}
			</dl>
		</Card.Content>
	</Card.Root>

	{#snippet cell(row: Row, column: DataTableColumn)}
		{#if column.key === 'title'}
			{row.title}
		{:else if column.key === 'qty'}
			<span class="tabular-nums">{row.qty}</span>
		{:else}
			<span class="tabular-nums">{roubles(row.total)}</span>
		{/if}
	{/snippet}
	<div class="grid gap-4 lg:grid-cols-2">
		<Card.Root>
			<Card.Content class="flex flex-col gap-3">
				<h2 class="text-2xl">Контрагенты</h2>
				<ReportTable rows={counterparties} {columns} emptyTitle="За эти даты продаж нет" {cell} />
			</Card.Content>
		</Card.Root>
		<Card.Root>
			<Card.Content class="flex flex-col gap-3">
				<h2 class="text-2xl">Модели</h2>
				<ReportTable rows={models} {columns} emptyTitle="За эти даты продаж нет" {cell} />
			</Card.Content>
		</Card.Root>
	</div>
{/if}
