<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { roubles } from '$lib/crm/payroll/labels';
	import { percentOfBp } from '$lib/crm/reports/labels';
	import MarginCells from '$lib/crm/reports/MarginCells.svelte';
	import ReportFilters from '$lib/crm/reports/ReportFilters.svelte';
	import ReportTable from '$lib/crm/ReportTable.svelte';
	import type { CounterpartyMarginRowDto, CounterpartyRequestRowDto } from '$lib/types/crm-reports';
	import { Card, ErrorState, StatusBadge, type DataTableColumn, type FilterField } from '$lib/ui';
	import { formatDateTime } from '$lib/utils/format';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const extra = $derived<FilterField[]>([
		{
			key: 'counterpartyId',
			label: 'Контрагент',
			type: 'select',
			placeholder: 'Выберите контрагента',
			options: [
				{ value: '', label: 'Все контрагенты' },
				...data.counterparties.map((row) => ({ value: String(row.id), label: row.name }))
			]
		}
	]);

	const MONEY: DataTableColumn[] = [
		{ key: 'qty', label: 'Штук', align: 'end' },
		{ key: 'total', label: 'Сумма', align: 'end' },
		{ key: 'cost', label: 'Себестоимость', align: 'end' },
		{ key: 'margin', label: 'Маржа', align: 'end' },
		{ key: 'share', label: 'Маржа, %', align: 'end' },
		{ key: 'paid', label: 'Оплачено', align: 'end' }
	];
	const columns: DataTableColumn[] = [
		{ key: 'title', label: 'Контрагент' },
		{ key: 'requests', label: 'Заявок', align: 'end' },
		...MONEY
	];
	const requestColumns: DataTableColumn[] = [
		{ key: 'number', label: 'Заявка' },
		{ key: 'at', label: 'Доставлена' },
		{ key: 'status', label: 'Статус' },
		...MONEY
	];

	type Row = CounterpartyMarginRowDto & { id: number };
	type RequestRow = CounterpartyRequestRowDto & { id: number };
	const rows = $derived<Row[]>(
		(data.report?.rows ?? []).map((row) => ({ ...row, id: row.counterpartyId }))
	);
	const requests = $derived<RequestRow[]>(
		(data.report?.requests ?? []).map((row) => ({ ...row, id: row.requestId }))
	);
	const chosen = $derived(rows.find((row) => row.counterpartyId === data.report?.counterpartyId));

	// The detail lives in the address: the sheet and a reload open the same counterparty.
	const detailHref = (counterpartyId: number): string => {
		const url = new URL(page.url);
		url.searchParams.set('counterpartyId', String(counterpartyId));
		return url.search;
	};
</script>

<svelte:head><title>По контрагентам</title></svelte:head>

<div>
	<h1 class="mb-2 text-3xl">По контрагентам</h1>
	<p class="max-w-2xl text-fg-muted">
		Продажи, себестоимость и маржа по каждому контрагенту за период доставки. Себестоимость берётся
		из складской позиции изделия. Нажмите на контрагента, чтобы раскрыть его заявки.
	</p>
</div>
<Card.Root>
	<Card.Content>
		<ReportFilters
			filters={data.filters}
			today={data.today}
			{extra}
			exportHref={resolve('/crm/reports/counterparties/export.xlsx')}
		/>
	</Card.Content>
</Card.Root>

{#if data.problem}
	<div data-testid="report-problem"><ErrorState title={data.problem} /></div>
{:else if data.report}
	<Card.Root>
		<Card.Content class="flex flex-col gap-4">
			<ReportTable {rows} {columns} emptyTitle="За эти даты продаж нет">
				{#snippet cell(row: Row, column: DataTableColumn)}
					{#if column.key === 'title'}
						<!-- Same page with a rewritten query string, so there is no route pattern to resolve. -->
						<!-- eslint-disable svelte/no-navigation-without-resolve -->
						<a class="text-link hover:text-link-hover" href={detailHref(row.counterpartyId)}>
							{row.title}
						</a>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					{:else if column.key === 'requests'}
						<span class="tabular-nums">{row.requestCount}</span>
					{:else}
						<MarginCells {row} key={column.key} />
					{/if}
				{/snippet}
			</ReportTable>
			<p>
				Маржа за период:
				<span class="font-medium tabular-nums" data-testid="margin-total">
					{roubles(data.report.totals.marginMinor)}
				</span>
				<span class="text-fg-muted">
					{percentOfBp(data.report.totals.marginBp)} от продаж {roubles(
						data.report.totals.totalMinor
					)}, себестоимость {roubles(data.report.totals.costMinor)}
				</span>
			</p>
			{#if data.report.totals.uncostedQty > 0}
				<p class="text-sm text-warning" data-testid="margin-uncosted">
					У {data.report.totals.uncostedQty} шт. не задана себестоимость: маржа по ним завышена. Заполните
					её на <a class="text-link" href={resolve('/crm/stock')}>складе</a>.
				</p>
			{/if}
		</Card.Content>
	</Card.Root>

	{#if chosen}
		<Card.Root>
			<Card.Header>
				<Card.Title>Заявки: {chosen.title}</Card.Title>
				<Card.Description>Свежие доставки сверху.</Card.Description>
			</Card.Header>
			<Card.Content>
				<ReportTable rows={requests} columns={requestColumns} emptyTitle="Заявок нет">
					{#snippet cell(row: RequestRow, column: DataTableColumn)}
						{#if column.key === 'number'}
							<a
								class="text-link hover:text-link-hover"
								href={resolve(`/crm/requests/${row.requestId}`)}
								data-testid="margin-request">{row.number}</a
							>
						{:else if column.key === 'at'}
							{formatDateTime(row.deliveredAt, data.timezone)}
						{:else if column.key === 'status'}
							<StatusBadge status={row.status} />
						{:else}
							<MarginCells {row} key={column.key} />
						{/if}
					{/snippet}
				</ReportTable>
			</Card.Content>
		</Card.Root>
	{/if}
{/if}
