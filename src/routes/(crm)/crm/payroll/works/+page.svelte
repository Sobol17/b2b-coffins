<script lang="ts">
	import { resolve } from '$app/paths';
	import DirectoryTable from '$lib/crm/payroll/DirectoryTable.svelte';
	import WorkTypeModal from '$lib/crm/payroll/WorkTypeModal.svelte';
	import { roubles } from '$lib/crm/payroll/labels';
	import { Breadcrumbs, Button, Card, type DataTableColumn } from '$lib/ui';
	import type { WorkTypeDto } from '$lib/types/crm-payroll';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const columns: DataTableColumn[] = [
		{ key: 'title', label: 'Название работы' },
		{ key: 'rateMinor', label: 'Стоимость за единицу', align: 'end' }
	];
	// null: closed; 'new': a new work; a work: the edit of that one.
	let editing = $state<WorkTypeDto | 'new' | null>(null);
</script>

<svelte:head><title>Работы и стоимость</title></svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
	<Breadcrumbs
		items={[{ label: 'Выплаты', href: resolve('/crm/payroll') }, { label: 'Работы и стоимость' }]}
	/>
	<div class="flex flex-wrap items-end gap-4">
		<div>
			<h1 class="mb-2 text-3xl">Работы и стоимость</h1>
			<p class="max-w-2xl text-fg-muted">
				Сколько мастерская платит за единицу работы. Сумму дня система делит поровну между теми, кто
				работал в этот день.
			</p>
		</div>
		{#if data.canManage}
			<Button class="sm:ml-auto" onclick={() => (editing = 'new')}>Добавить работу</Button>
		{/if}
	</div>

	<Card.Root>
		<Card.Content>
			<DirectoryTable
				rows={data.works}
				{columns}
				canManage={data.canManage}
				emptyTitle="Работ нет"
				nameOf={(row) => row.title}
				onEdit={(row) => (editing = row)}
			>
				{#snippet own(row: WorkTypeDto, column: DataTableColumn)}
					{#if column.key === 'title'}
						{row.title}
					{:else if column.key === 'rateMinor'}
						<span class="tabular-nums" data-testid="work-rate">{roubles(row.rateMinor)}</span>
					{/if}
				{/snippet}
			</DirectoryTable>
		</Card.Content>
	</Card.Root>
</div>

<WorkTypeModal
	open={editing !== null}
	work={editing === 'new' ? null : editing}
	onClose={() => (editing = null)}
/>
