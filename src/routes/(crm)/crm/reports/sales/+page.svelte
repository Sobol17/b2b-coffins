<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { roubles } from '$lib/crm/payroll/labels';
	import { SALES_BUCKET_TITLE, SALES_GROUP_TITLE } from '$lib/crm/reports/labels';
	import ReportFilters from '$lib/crm/reports/ReportFilters.svelte';
	import ReportTable from '$lib/crm/ReportTable.svelte';
	import { SALES_BUCKETS, SALES_GROUPS, type SalesGroup } from '$lib/types/crm-reports';
	import {
		buttonVariants,
		Card,
		ErrorState,
		type DataTableColumn,
		type FilterField
	} from '$lib/ui';
	import { formatDate } from '$lib/utils/format';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const group = $derived<SalesGroup>(data.report?.group ?? 'counterparty');
	const extra = $derived<FilterField[]>([
		...(group === 'period'
			? [
					{
						key: 'bucket',
						label: 'Шаг',
						type: 'select' as const,
						placeholder: 'Выберите шаг',
						options: SALES_BUCKETS.map((value) => ({ value, label: SALES_BUCKET_TITLE[value] }))
					}
				]
			: []),
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
	// The step has a default the address may not carry: the select shows what the report used.
	const shown = $derived(
		data.report?.group === 'period' ? { ...data.filters, bucket: data.report.bucket } : data.filters
	);
	// The grouping lives in the address: the sheet and a reload see the same tab.
	const groupHref = (next: SalesGroup): string => {
		const url = new URL(page.url);
		url.searchParams.set('group', next);
		return url.search;
	};

	const MONEY: DataTableColumn[] = [
		{ key: 'requests', label: 'Заявок', align: 'end' },
		{ key: 'qty', label: 'Штук', align: 'end' },
		{ key: 'items', label: 'Сумма', align: 'end' },
		{ key: 'discount', label: 'Скидка', align: 'end' },
		{ key: 'total', label: 'Итог', align: 'end' },
		{ key: 'paid', label: 'Оплачено', align: 'end' }
	];
	const columns = $derived.by((): DataTableColumn[] => {
		if (group === 'model') {
			return [
				{ key: 'title', label: 'Модель' },
				{ key: 'requests', label: 'Заявок', align: 'end' },
				{ key: 'qty', label: 'Штук', align: 'end' },
				{ key: 'items', label: 'Сумма до скидки', align: 'end' }
			];
		}
		return [{ key: 'title', label: group === 'period' ? 'Период' : 'Контрагент' }, ...MONEY];
	});

	interface Row {
		id: number;
		title: string;
		requests: number;
		qty: number;
		items: number;
		discount?: number;
		total?: number;
		paid?: number;
	}
	const rows = $derived.by((): Row[] => {
		const report = data.report;
		if (!report) return [];
		if (report.group === 'model') {
			return report.rows.map((row) => ({
				id: row.modelId,
				title: row.title,
				requests: row.requestCount,
				qty: row.qty,
				items: row.linesTotalMinor
			}));
		}
		const money = (row: (typeof report.rows)[number]) => ({
			requests: row.requestCount,
			qty: row.qty,
			items: row.itemsTotalMinor,
			discount: row.discountMinor,
			total: row.totalMinor,
			paid: row.paidMinor
		});
		if (report.group === 'period') {
			return report.rows.map((row, index) => ({
				id: index,
				title:
					row.bucketFrom === row.bucketTo
						? formatDate(`${row.bucketFrom}T00:00:00Z`)
						: `${formatDate(`${row.bucketFrom}T00:00:00Z`)} – ${formatDate(`${row.bucketTo}T00:00:00Z`)}`,
				...money(row)
			}));
		}
		return report.rows.map((row) => ({ id: row.counterpartyId, title: row.title, ...money(row) }));
	});
	const MONEY_KEYS: ReadonlySet<string> = new Set(['items', 'discount', 'total', 'paid']);
</script>

<svelte:head><title>Продажи</title></svelte:head>

<div>
	<h1 class="mb-2 text-3xl">Продажи</h1>
	<p class="max-w-2xl text-fg-muted">
		Доставленные заявки контрагентов по дню доставки. Заявки на склад, отменённые и отклонённые в
		продажи не входят.
	</p>
</div>
<Card.Root>
	<Card.Content>
		<ReportFilters
			filters={shown}
			today={data.today}
			{extra}
			exportHref={resolve('/crm/reports/sales/export.xlsx')}
		/>
	</Card.Content>
</Card.Root>

{#if data.problem}
	<div data-testid="report-problem"><ErrorState title={data.problem} /></div>
{:else if data.report}
	<Card.Root>
		<Card.Content class="flex flex-col gap-4">
			<nav class="flex flex-wrap gap-2" aria-label="Группировка" data-testid="sales-groups">
				<!-- Same page with a rewritten query string, so there is no route pattern to resolve. -->
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				{#each SALES_GROUPS as value (value)}
					<a
						href={groupHref(value)}
						aria-current={value === group ? 'page' : undefined}
						class={buttonVariants({ variant: value === group ? 'secondary' : 'ghost', size: 'sm' })}
					>
						{SALES_GROUP_TITLE[value]}
					</a>
				{/each}
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			</nav>
			<ReportTable {rows} {columns} emptyTitle="За эти даты продаж нет">
				{#snippet cell(row: Row, column: DataTableColumn)}
					{#if column.key === 'title'}
						{row.title}
					{:else if column.key === 'requests'}
						<span class="tabular-nums">{row.requests}</span>
					{:else if column.key === 'qty'}
						<span class="tabular-nums">{row.qty}</span>
					{:else if MONEY_KEYS.has(column.key)}
						<span class="tabular-nums">
							{roubles(row[column.key as 'items' | 'discount' | 'total' | 'paid'] ?? 0)}
						</span>
					{/if}
				{/snippet}
			</ReportTable>
			<p>
				Итого:
				<span class="font-medium tabular-nums" data-testid="sales-total">
					{roubles(data.report.totals.totalMinor)}
				</span>
				<span class="text-fg-muted">
					заявок {data.report.totals.requestCount}, штук {data.report.totals.qty}, оплачено
					{roubles(data.report.totals.paidMinor)}
				</span>
			</p>
		</Card.Content>
	</Card.Root>
{/if}
