<script lang="ts">
	import SectionTabs from '$lib/crm/SectionTabs.svelte';
	import { PAYROLL_TABS } from '$lib/crm/sections';
	import ReportTable from '$lib/crm/ReportTable.svelte';
	import { roubles } from '$lib/crm/payroll/labels';
	import { Card, ErrorState, FilterBar, type DataTableColumn, type FilterField } from '$lib/ui';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const fields: FilterField[] = [
		{ key: 'from', label: 'С', type: 'date', placeholder: 'Выберите дату' },
		{ key: 'to', label: 'По', type: 'date', placeholder: 'Выберите дату' }
	];
	// svelte-ignore state_referenced_locally
	let filters = $state<Record<string, string>>({ ...data.range });

	const staffColumns: DataTableColumn[] = [
		{ key: 'fullName', label: 'Сотрудник' },
		{ key: 'daysWorked', label: 'Дней', align: 'end' },
		{ key: 'accrued', label: 'Начислено', align: 'end' }
	];
	const workColumns: DataTableColumn[] = [
		{ key: 'title', label: 'Работа' },
		{ key: 'qty', label: 'Количество', align: 'end' },
		{ key: 'amount', label: 'Сумма', align: 'end' }
	];
	const staffRows = $derived(
		(data.report?.staff ?? []).map((row) => ({ ...row, id: row.staffId }))
	);
	const workRows = $derived(
		(data.report?.works ?? []).map((row) => ({ ...row, id: row.workTypeId }))
	);
	const totalDays = $derived(staffRows.reduce((sum, row) => sum + row.daysWorked, 0));
	const totalQty = $derived(workRows.reduce((sum, row) => sum + row.qty, 0));
	type StaffRow = (typeof staffRows)[number];
	type WorkRow = (typeof workRows)[number];
</script>

<svelte:head><title>Отчёт по выплатам</title></svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
	<SectionTabs tabs={PAYROLL_TABS} label="Выплаты" />
	<div>
		<h1 class="mb-2 text-3xl">Отчёт по выплатам</h1>
		<p class="max-w-2xl text-fg-muted">
			Заработок сотрудников и выработка по видам работ за выбранные даты. Корректировки в отчёт не
			входят: они видны в ведомости недели.
		</p>
	</div>

	<Card.Root>
		<Card.Content>
			<FilterBar {fields} bind:filters />
		</Card.Content>
	</Card.Root>

	{#if data.problem}
		<div data-testid="report-problem"><ErrorState title={data.problem} /></div>
	{:else if data.report}
		<Card.Root>
			<Card.Content class="flex flex-col gap-4">
				<h2 class="text-2xl">По сотрудникам</h2>
				<ReportTable
					rows={staffRows}
					columns={staffColumns}
					emptyTitle="За эти даты никто не работал"
				>
					{#snippet cell(row: StaffRow, column: DataTableColumn)}
						{#if column.key === 'fullName'}
							{row.fullName}
						{:else if column.key === 'daysWorked'}
							<span class="tabular-nums">{row.daysWorked}</span>
						{:else if column.key === 'accrued'}
							<span class="tabular-nums">{roubles(row.accruedMinor)}</span>
						{/if}
					{/snippet}
					{#snippet footer(column: DataTableColumn)}
						{#if column.key === 'fullName'}
							Итого
						{:else if column.key === 'daysWorked'}
							<span class="tabular-nums">{totalDays}</span>
						{:else if column.key === 'accrued'}
							<span class="tabular-nums" data-testid="report-accrued">
								{roubles(data.report.accruedTotalMinor)}
							</span>
						{/if}
					{/snippet}
				</ReportTable>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Content class="flex flex-col gap-4">
				<h2 class="text-2xl">По видам работ</h2>
				<ReportTable rows={workRows} columns={workColumns} emptyTitle="За эти даты работ нет">
					{#snippet cell(row: WorkRow, column: DataTableColumn)}
						{#if column.key === 'title'}
							{row.title}
						{:else if column.key === 'qty'}
							<span class="tabular-nums">{row.qty}</span>
						{:else if column.key === 'amount'}
							<span class="tabular-nums">{roubles(row.amountMinor)}</span>
						{/if}
					{/snippet}
					{#snippet footer(column: DataTableColumn)}
						{#if column.key === 'title'}
							Итого
						{:else if column.key === 'qty'}
							<span class="tabular-nums" data-testid="report-qty">{totalQty}</span>
						{:else if column.key === 'amount'}
							<span class="tabular-nums" data-testid="report-works">
								{roubles(data.report.worksTotalMinor)}
							</span>
						{/if}
					{/snippet}
				</ReportTable>
				<p class="text-sm text-fg-muted">
					Начислено меньше суммы работ на остаток от деления: долю за день система округляет до
					рубля вниз.
				</p>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
