<script lang="ts">
	import { resolve } from '$app/paths';
	import { FUNNEL_STAGE_TITLE, percentOfBp } from '$lib/crm/reports/labels';
	import ReportFilters from '$lib/crm/reports/ReportFilters.svelte';
	import ReportTable from '$lib/crm/ReportTable.svelte';
	import { Card, ErrorState, type DataTableColumn } from '$lib/ui';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const columns: DataTableColumn[] = [
		{ key: 'stage', label: 'Стадия' },
		{ key: 'count', label: 'Заявок', align: 'end' },
		{ key: 'previous', label: 'От предыдущей', align: 'end' },
		{ key: 'first', label: 'От отправленных', align: 'end' }
	];
	const rows = $derived((data.report?.stages ?? []).map((row, index) => ({ ...row, id: index })));
	type Row = (typeof rows)[number];
</script>

<svelte:head><title>Воронка заявок</title></svelte:head>

<div>
	<h1 class="mb-2 text-3xl">Воронка</h1>
	<p class="max-w-2xl text-fg-muted">
		Заявки контрагентов, отправленные в выбранные даты, и стадия, до которой каждая дошла к
		сегодняшнему дню.
	</p>
</div>
<Card.Root>
	<Card.Content>
		<ReportFilters
			filters={data.filters}
			today={data.today}
			exportHref={resolve('/crm/reports/funnel/export.xlsx')}
		/>
	</Card.Content>
</Card.Root>

{#if data.problem}
	<div data-testid="report-problem"><ErrorState title={data.problem} /></div>
{:else if data.report}
	<Card.Root>
		<Card.Content class="flex flex-col gap-4">
			<ReportTable {rows} {columns} emptyTitle="За эти даты заявок нет">
				{#snippet cell(row: Row, column: DataTableColumn)}
					{#if column.key === 'stage'}
						{FUNNEL_STAGE_TITLE[row.stage]}
					{:else if column.key === 'count'}
						<span class="tabular-nums">{row.count}</span>
					{:else if column.key === 'previous'}
						<span class="tabular-nums">{percentOfBp(row.shareOfPreviousBp)}</span>
					{:else}
						<span class="tabular-nums">{percentOfBp(row.shareOfFirstBp)}</span>
					{/if}
				{/snippet}
			</ReportTable>
			<dl class="grid grid-cols-2 gap-3 sm:max-w-md" data-testid="funnel-lost">
				<div>
					<dt class="text-sm text-fg-muted">Отменено</dt>
					<dd class="text-xl tabular-nums">{data.report.cancelledCount}</dd>
				</div>
				<div>
					<dt class="text-sm text-fg-muted">Отклонено</dt>
					<dd class="text-xl tabular-nums">{data.report.rejectedCount}</dd>
				</div>
			</dl>
		</Card.Content>
	</Card.Root>
{/if}
