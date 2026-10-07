<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { roubles } from '$lib/crm/payroll/labels';
	import ReportFilters from '$lib/crm/reports/ReportFilters.svelte';
	import ReverseModal from '$lib/crm/reports/ReverseModal.svelte';
	import StatTile from '$lib/crm/reports/StatTile.svelte';
	import TransferModal from '$lib/crm/reports/TransferModal.svelte';
	import ReportTable from '$lib/crm/ReportTable.svelte';
	import { isTransferReversible } from '$lib/domain/charity/balance';
	import type { CharityTransferDto } from '$lib/types/crm-reports';
	import type { ListQuery } from '$lib/types/list';
	import { Button, Card, DataTable, ErrorState, type DataTableColumn } from '$lib/ui';
	import { formatDate, PRICE_DASH } from '$lib/utils/format';
	import { listQueryOf, withListQuery } from '$lib/utils/list-url';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const accrualColumns: DataTableColumn[] = [
		{ key: 'title', label: 'Контрагент' },
		{ key: 'requests', label: 'Заявок', align: 'end' },
		{ key: 'amount', label: 'Начислено', align: 'end' }
	];
	const columns: DataTableColumn[] = [
		{ key: 'date', label: 'Дата' },
		{ key: 'amount', label: 'Сумма', align: 'end' },
		{ key: 'document', label: 'Документ' },
		{ key: 'comment', label: 'Комментарий' },
		{ key: 'author', label: 'Кто записал' },
		{ key: 'state', label: 'Состояние' },
		{ key: 'actions', label: '' }
	];
	const accruals = $derived(
		(data.report?.accruals ?? []).map((row) => ({ ...row, id: row.counterpartyId }))
	);
	type AccrualRow = (typeof accruals)[number];
	const query = $derived(listQueryOf(page.url, data.report?.transfers ?? { page: 1, perPage: 25 }));
	let transferOpen = $state(false);
	let reversing = $state<CharityTransferDto | null>(null);

	const stateOf = (row: CharityTransferDto): string => {
		if (row.reversalOfId !== null) return 'Сторно';
		return row.isReversed ? 'Сторнировано' : '';
	};

	function changeQuery(next: ListQuery): void {
		// Same page with a rewritten query string, so there is no route pattern to resolve.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(withListQuery(page.url, next), { keepFocus: true, noScroll: true });
	}
</script>

<svelte:head><title>Фонд</title></svelte:head>

<div class="flex flex-wrap items-end gap-4">
	<div>
		<h1 class="mb-2 text-3xl">Фонд</h1>
		<p class="max-w-2xl text-fg-muted">
			Отчисления с доставленных заявок и перечисления в фонд. Ошибочное перечисление не правится:
			его гасит сторно.
		</p>
	</div>
	{#if data.report?.canManage && data.report.remainderMinor > 0}
		<Button class="sm:ml-auto" onclick={() => (transferOpen = true)}>Записать перечисление</Button>
	{/if}
</div>
<Card.Root>
	<Card.Content>
		<ReportFilters
			filters={data.filters}
			today={data.today}
			exportHref={resolve('/crm/reports/charity/export.xlsx')}
		/>
	</Card.Content>
</Card.Root>

{#if data.problem}
	<div data-testid="report-problem"><ErrorState title={data.problem} /></div>
{:else if data.report}
	{@const r = data.report}
	<div class="grid gap-4 sm:grid-cols-3">
		<StatTile
			testid="tile-accrued-all"
			label="Начислено всего"
			value={roubles(r.accruedAllMinor)}
			hint={`За период: ${roubles(r.accruedInRangeMinor)}`}
		/>
		<StatTile
			testid="tile-transferred"
			label="Перечислено"
			value={roubles(r.transferredAllMinor)}
			hint={`За период: ${roubles(r.transferredInRangeMinor)}`}
		/>
		<StatTile testid="tile-remainder" label="К перечислению" value={roubles(r.remainderMinor)} />
	</div>

	<Card.Root>
		<Card.Content class="flex flex-col gap-3">
			<h2 class="text-2xl">Начислено за период</h2>
			<ReportTable rows={accruals} columns={accrualColumns} emptyTitle="За эти даты начислений нет">
				{#snippet cell(row: AccrualRow, column: DataTableColumn)}
					{#if column.key === 'title'}
						{row.title}
					{:else if column.key === 'requests'}
						<span class="tabular-nums">{row.requestCount}</span>
					{:else}
						<span class="tabular-nums">{roubles(row.amountMinor)}</span>
					{/if}
				{/snippet}
			</ReportTable>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Content class="flex flex-col gap-3">
			<h2 class="text-2xl">Перечисления</h2>
			<DataTable
				{columns}
				rows={r.transfers.rows}
				total={r.transfers.total}
				{query}
				onQueryChange={changeQuery}
				emptyTitle="За эти даты перечислений нет"
			>
				{#snippet cell(row: CharityTransferDto, column: DataTableColumn)}
					{#if column.key === 'date'}
						{formatDate(`${row.transferredOn}T00:00:00Z`)}
					{:else if column.key === 'amount'}
						<span class="tabular-nums">{roubles(row.amountMinor)}</span>
					{:else if column.key === 'document'}
						{row.documentRef ?? PRICE_DASH}
					{:else if column.key === 'comment'}
						{row.comment ?? PRICE_DASH}
					{:else if column.key === 'author'}
						{row.createdByName}
					{:else if column.key === 'state'}
						{stateOf(row)}
					{:else if r.canManage && isTransferReversible(row)}
						<Button variant="ghost" size="sm" onclick={() => (reversing = row)}>
							Сторнировать
						</Button>
					{/if}
				{/snippet}
			</DataTable>
		</Card.Content>
	</Card.Root>

	<TransferModal bind:open={transferOpen} today={data.today} remainderMinor={r.remainderMinor} />
	<ReverseModal transfer={reversing} onClose={() => (reversing = null)} />
{/if}
