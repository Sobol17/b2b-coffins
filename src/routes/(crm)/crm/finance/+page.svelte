<script lang="ts">
	import { resolve } from '$app/paths';
	import EntryForm from '$lib/crm/finance/EntryForm.svelte';
	import FeedTable from '$lib/crm/finance/FeedTable.svelte';
	import FinanceChart from '$lib/crm/finance/FinanceChart.svelte';
	import { FINANCE_KIND_TITLE, FINANCE_SOURCE_TITLE, signedAmount } from '$lib/crm/finance/labels';
	import SourceTable from '$lib/crm/finance/SourceTable.svelte';
	import { roubles } from '$lib/crm/payroll/labels';
	import ReportFilters from '$lib/crm/reports/ReportFilters.svelte';
	import StatTile from '$lib/crm/reports/StatTile.svelte';
	import { FINANCE_KINDS, FINANCE_SOURCES } from '$lib/types/finance';
	import { Card, ErrorState, type FilterField } from '$lib/ui';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const extra: FilterField[] = [
		{
			key: 'kind',
			label: 'Тип',
			type: 'select',
			placeholder: 'Выберите тип',
			options: [
				{ value: '', label: 'Все' },
				...FINANCE_KINDS.map((value) => ({ value, label: FINANCE_KIND_TITLE[value] }))
			]
		},
		{
			key: 'source',
			label: 'Источник',
			type: 'select',
			placeholder: 'Выберите источник',
			options: [
				{ value: '', label: 'Все' },
				...FINANCE_SOURCES.map((value) => ({ value, label: FINANCE_SOURCE_TITLE[value] }))
			]
		}
	];
</script>

<svelte:head><title>Финансы</title></svelte:head>

<div>
	<h1 class="mb-2 text-3xl">Финансы</h1>
	<p class="max-w-2xl text-fg-muted">
		Деньги мастерской за период: оплаты заявок, выплаты, фонд и ваши операции.
	</p>
</div>

<Card.Root>
	<Card.Content class="flex flex-col gap-3">
		<h2 class="text-2xl">Новая операция</h2>
		<EntryForm today={data.today} />
	</Card.Content>
</Card.Root>

<Card.Root>
	<Card.Content>
		<ReportFilters
			filters={data.filters}
			today={data.today}
			{extra}
			exportHref={resolve('/crm/finance/export.xlsx')}
		/>
	</Card.Content>
</Card.Root>

{#if data.problem}
	<div data-testid="report-problem"><ErrorState title={data.problem} /></div>
{:else if data.report}
	{@const s = data.report.summary}
	<div class="grid gap-4 sm:grid-cols-3">
		<StatTile testid="finance-income" label="Доходы" value={roubles(s.incomeMinor)} />
		<StatTile testid="finance-expense" label="Расходы" value={roubles(s.expenseMinor)} />
		<StatTile
			testid="finance-net"
			label="Итог"
			value={signedAmount(s.netMinor, roubles)}
			hint={s.netMinor < 0 ? 'убыток' : 'прибыль'}
		/>
	</div>

	<div class="grid gap-4 2xl:grid-cols-2">
		<Card.Root>
			<Card.Content class="flex min-w-0 flex-col gap-3">
				<h2 class="text-2xl">По периодам</h2>
				<FinanceChart buckets={s.buckets} bucket={s.bucket} />
			</Card.Content>
		</Card.Root>
		<Card.Root>
			<Card.Content class="flex min-w-0 flex-col gap-3">
				<h2 class="text-2xl">По источникам</h2>
				<SourceTable summary={s} />
			</Card.Content>
		</Card.Root>
	</div>

	<Card.Root id="finance-feed">
		<Card.Content class="flex flex-col gap-3">
			<h2 class="text-2xl">История</h2>
			<FeedTable feed={data.report.feed} today={data.today} />
		</Card.Content>
	</Card.Root>
{/if}
