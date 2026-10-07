<script lang="ts">
	import { resolve } from '$app/paths';
	import { daysOrDash } from '$lib/crm/reports/labels';
	import ReportFilters from '$lib/crm/reports/ReportFilters.svelte';
	import ReportTable from '$lib/crm/ReportTable.svelte';
	import { KIND_OPTIONS } from '$lib/crm/stock/labels';
	import { Card, ErrorState, type DataTableColumn, type FilterField } from '$lib/ui';
	import { PRICE_DASH } from '$lib/utils/format';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const extra: FilterField[] = [
		{
			key: 'kind',
			label: 'Вид',
			type: 'select',
			placeholder: 'Выберите вид',
			options: [{ value: '', label: 'Все виды' }, ...KIND_OPTIONS]
		}
	];
	const columns: DataTableColumn[] = [
		{ key: 'code', label: 'Код' },
		{ key: 'title', label: 'Позиция' },
		{ key: 'color', label: 'Цвет' },
		{ key: 'openingQty', label: 'Начало', align: 'end' },
		{ key: 'incomeQty', label: 'Приход', align: 'end' },
		{ key: 'outcomeQty', label: 'Расход', align: 'end' },
		{ key: 'closingQty', label: 'Конец', align: 'end' },
		{ key: 'shippedQty', label: 'Отгружено', align: 'end' },
		{ key: 'days', label: 'Дни запаса', align: 'end' }
	];
	const rows = $derived((data.report?.rows ?? []).map((row, index) => ({ ...row, id: index })));
	type Row = (typeof rows)[number];
	type QtyKey = 'openingQty' | 'incomeQty' | 'outcomeQty' | 'closingQty' | 'shippedQty';
</script>

<svelte:head><title>Оборачиваемость склада</title></svelte:head>

<div>
	<h1 class="mb-2 text-3xl">Склад</h1>
	<p class="max-w-2xl text-fg-muted">
		Движение позиций за период в штуках. Дни запаса показывают, на сколько дней хватает среднего
		остатка при темпе отгрузки этого периода.
	</p>
</div>
<Card.Root>
	<Card.Content>
		<ReportFilters
			filters={data.filters}
			today={data.today}
			{extra}
			exportHref={resolve('/crm/reports/stock/export.xlsx')}
		/>
	</Card.Content>
</Card.Root>

{#if data.problem}
	<div data-testid="report-problem"><ErrorState title={data.problem} /></div>
{:else if data.report}
	<Card.Root>
		<Card.Content>
			<ReportTable {rows} {columns} emptyTitle="За эти даты движений нет">
				{#snippet cell(row: Row, column: DataTableColumn)}
					{#if column.key === 'code'}
						{row.code}
					{:else if column.key === 'title'}
						<a
							class="text-link hover:text-link-hover"
							href={resolve(`/crm/stock/${row.stockItemId}`)}
						>
							{row.title}
						</a>
					{:else if column.key === 'color'}
						{row.optionTitle ?? PRICE_DASH}
					{:else if column.key === 'days'}
						<span class="tabular-nums">{daysOrDash(row.turnoverDays)}</span>
					{:else}
						<span class="tabular-nums">{row[column.key as QtyKey]}</span>
					{/if}
				{/snippet}
			</ReportTable>
		</Card.Content>
	</Card.Root>
{/if}
