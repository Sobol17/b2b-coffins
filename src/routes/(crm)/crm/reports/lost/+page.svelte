<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { roubles } from '$lib/crm/payroll/labels';
	import { LOST_STATUS_TITLE } from '$lib/crm/reports/labels';
	import ReportFilters from '$lib/crm/reports/ReportFilters.svelte';
	import ReportTable from '$lib/crm/ReportTable.svelte';
	import { LOST_STATUSES, type LostRequestRowDto } from '$lib/types/crm-reports';
	import type { ListQuery } from '$lib/types/list';
	import {
		Card,
		DataTable,
		ErrorState,
		StatusBadge,
		type DataTableColumn,
		type FilterField
	} from '$lib/ui';
	import { formatDateTime, PRICE_DASH } from '$lib/utils/format';
	import { listQueryOf, withListQuery } from '$lib/utils/list-url';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const extra: FilterField[] = [
		{
			key: 'status',
			label: 'Статус',
			type: 'select',
			placeholder: 'Выберите статус',
			options: [
				{ value: '', label: 'Все' },
				...LOST_STATUSES.map((value) => ({ value, label: LOST_STATUS_TITLE[value] }))
			]
		}
	];
	const reasonColumns: DataTableColumn[] = [
		{ key: 'title', label: 'Причина' },
		{ key: 'count', label: 'Заявок', align: 'end' },
		{ key: 'total', label: 'Сумма', align: 'end' }
	];
	const columns: DataTableColumn[] = [
		{ key: 'at', label: 'Дата' },
		{ key: 'number', label: 'Заявка' },
		{ key: 'status', label: 'Статус' },
		{ key: 'counterparty', label: 'Контрагент' },
		{ key: 'reason', label: 'Причина' },
		{ key: 'comment', label: 'Комментарий' },
		{ key: 'total', label: 'Сумма', align: 'end' }
	];
	const reasons = $derived(
		(data.report?.reasons ?? []).map((row) => ({ ...row, id: row.reasonId ?? 0 }))
	);
	type ReasonRow = (typeof reasons)[number];
	// A request is lost once, so its id names the row.
	const rows = $derived(
		(data.report?.page.rows ?? []).map((row) => ({ ...row, id: row.requestId }))
	);
	type Row = LostRequestRowDto & { id: number };
	const query = $derived(listQueryOf(page.url, data.report?.page ?? { page: 1, perPage: 25 }));

	function changeQuery(next: ListQuery): void {
		// Same page with a rewritten query string, so there is no route pattern to resolve.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(withListQuery(page.url, next), { keepFocus: true, noScroll: true });
	}
</script>

<svelte:head><title>Отменённые и отклонённые заявки</title></svelte:head>

<div>
	<h1 class="mb-2 text-3xl">Отменённые и отклонённые</h1>
	<p class="max-w-2xl text-fg-muted">
		Заявки, которые отменил контрагент или отклонила мастерская в выбранные даты, с причиной и
		суммой.
	</p>
</div>
<Card.Root>
	<Card.Content>
		<ReportFilters
			filters={data.filters}
			today={data.today}
			{extra}
			exportHref={resolve('/crm/reports/lost/export.xlsx')}
		/>
	</Card.Content>
</Card.Root>

{#if data.problem}
	<div data-testid="report-problem"><ErrorState title={data.problem} /></div>
{:else if data.report}
	<dl class="grid grid-cols-2 gap-4 rounded-lg border border-border p-4 sm:grid-cols-3">
		<div>
			<dt class="text-sm text-fg-muted">Отменено</dt>
			<dd class="text-2xl tabular-nums" data-testid="lost-cancelled">
				{data.report.cancelledCount}
			</dd>
		</div>
		<div>
			<dt class="text-sm text-fg-muted">Отклонено</dt>
			<dd class="text-2xl tabular-nums" data-testid="lost-rejected">{data.report.rejectedCount}</dd>
		</div>
		<div>
			<dt class="text-sm text-fg-muted">На сумму</dt>
			<dd class="text-2xl tabular-nums" data-testid="lost-total">
				{roubles(data.report.totalMinor)}
			</dd>
		</div>
	</dl>

	<Card.Root>
		<Card.Content class="flex flex-col gap-3">
			<h2 class="text-2xl">По причинам</h2>
			<ReportTable rows={reasons} columns={reasonColumns} emptyTitle="За эти даты потерь нет">
				{#snippet cell(row: ReasonRow, column: DataTableColumn)}
					{#if column.key === 'title'}
						{row.title}
					{:else if column.key === 'count'}
						<span class="tabular-nums">{row.count}</span>
					{:else}
						<span class="tabular-nums">{roubles(row.totalMinor)}</span>
					{/if}
				{/snippet}
			</ReportTable>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Content class="flex flex-col gap-3">
			<h2 class="text-2xl">Заявки</h2>
			<DataTable
				{columns}
				{rows}
				total={data.report.page.total}
				{query}
				onQueryChange={changeQuery}
				emptyTitle="За эти даты потерь нет"
			>
				{#snippet cell(row: Row, column: DataTableColumn)}
					{#if column.key === 'at'}
						{formatDateTime(row.at, data.timezone)}
					{:else if column.key === 'number'}
						<a
							class="text-link hover:text-link-hover"
							href={resolve(`/crm/requests/${row.requestId}`)}
						>
							{row.number}
						</a>
					{:else if column.key === 'status'}
						<StatusBadge status={row.status} />
					{:else if column.key === 'counterparty'}
						{row.counterpartyTitle ?? PRICE_DASH}
					{:else if column.key === 'reason'}
						{row.reasonTitle ?? PRICE_DASH}
					{:else if column.key === 'comment'}
						{row.comment ?? PRICE_DASH}
					{:else}
						<span class="tabular-nums">{roubles(row.totalMinor)}</span>
					{/if}
				{/snippet}
			</DataTable>
		</Card.Content>
	</Card.Root>
{/if}
