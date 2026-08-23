<script lang="ts">
	import {
		AnimatedCounter,
		Breadcrumbs,
		DataTable,
		FilterBar,
		Pagination,
		PriceCell,
		StatusBadge,
		Stepper,
		type DataTableColumn,
		type FilterField
	} from '$lib/ui';
	import { resolve } from '$app/paths';
	import { REQUEST_STATUSES } from '$lib/types/request';
	import type { ListQuery } from '$lib/types/list';
	import Showcase from '../Showcase.svelte';

	interface DemoRow {
		id: number;
		number: string;
		status: (typeof REQUEST_STATUSES)[number];
		totalMinor?: number;
	}

	const columns: DataTableColumn[] = [
		{ key: 'number', label: 'Номер', sortable: true },
		{ key: 'status', label: 'Статус' },
		{ key: 'totalMinor', label: 'Сумма', align: 'end' }
	];

	const allRows: DemoRow[] = Array.from({ length: 7 }, (_, index) => ({
		id: index + 1,
		number: `З-${1000 + index}`,
		status: REQUEST_STATUSES[index % REQUEST_STATUSES.length] ?? 'new',
		// The last row arrives without a price: that is what a role without prices receives.
		...(index === 6 ? {} : { totalMinor: 125000 * (index + 1) })
	}));

	let query = $state<ListQuery>({ page: 1, perPage: 3 });
	const rows = $derived(
		allRows.slice((query.page - 1) * query.perPage, query.page * query.perPage)
	);

	const filterFields: FilterField[] = [
		{ key: 'search', label: 'Поиск', type: 'text' },
		{
			key: 'status',
			label: 'Статус',
			type: 'select',
			options: [
				{ value: '', label: 'Все' },
				{ value: 'new', label: 'Заявка' }
			]
		}
	];
	let filters = $state<Record<string, string>>({});
</script>

<Showcase name="DataTable">
	<div class="w-full">
		<DataTable
			{columns}
			{rows}
			total={allRows.length}
			{query}
			onQueryChange={(next) => (query = next)}
			exportUrl="/api/health?format=xlsx"
		>
			{#snippet cell(row: DemoRow, column: DataTableColumn)}
				{#if column.key === 'status'}
					<StatusBadge status={row.status} />
				{:else if column.key === 'totalMinor'}
					<PriceCell valueMinor={row.totalMinor} />
				{:else}
					{row.number}
				{/if}
			{/snippet}
		</DataTable>
	</div>
</Showcase>

<Showcase name="FilterBar">
	<FilterBar fields={filterFields} bind:filters syncToUrl={false} />
</Showcase>

<Showcase name="Pagination">
	<Pagination total={allRows.length} {query} onQueryChange={(next) => (query = next)} />
</Showcase>

<Showcase name="Breadcrumbs">
	<Breadcrumbs
		items={[
			{ label: 'Портал', href: resolve('/portal') },
			{ label: 'Каталог', href: resolve('/portal') },
			{ label: 'Модель' }
		]}
	/>
</Showcase>

<Showcase name="PriceCell">
	<PriceCell valueMinor={1250050} />
	<PriceCell />
</Showcase>

<Showcase name="StatusBadge">
	{#each REQUEST_STATUSES as status (status)}
		<StatusBadge {status} />
	{/each}
</Showcase>

<Showcase name="Stepper">
	<Stepper
		current="ready"
		reachedAt={{ new: '2026-08-01T09:00:00Z', ready: '2026-08-04T12:30:00Z' }}
	/>
</Showcase>

<Showcase name="AnimatedCounter">
	<AnimatedCounter valueMinor={4815160} />
</Showcase>
