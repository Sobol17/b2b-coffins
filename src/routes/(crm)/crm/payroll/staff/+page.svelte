<script lang="ts">
	import { resolve } from '$app/paths';
	import DirectoryTable from '$lib/crm/payroll/DirectoryTable.svelte';
	import StaffModal from '$lib/crm/payroll/StaffModal.svelte';
	import { Breadcrumbs, Button, Card, type DataTableColumn } from '$lib/ui';
	import type { StaffDto } from '$lib/types/crm-payroll';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const columns: DataTableColumn[] = [
		{ key: 'fullName', label: 'ФИО' },
		{ key: 'position', label: 'Должность' }
	];
	// null: closed; 'new': a new worker; a worker: the edit of that one.
	let editing = $state<StaffDto | 'new' | null>(null);
</script>

<svelte:head><title>Сотрудники</title></svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
	<Breadcrumbs
		items={[{ label: 'Выплаты', href: resolve('/crm/payroll') }, { label: 'Сотрудники' }]}
	/>
	<div class="flex flex-wrap items-end gap-4">
		<div>
			<h1 class="mb-2 text-3xl">Сотрудники</h1>
			<p class="max-w-2xl text-fg-muted">
				Те, кого отмечают в рабочем дне. Сотрудник, который больше не работает, выключается: его дни
				и выплаты остаются в ведомостях.
			</p>
		</div>
		{#if data.canManage}
			<Button class="sm:ml-auto" onclick={() => (editing = 'new')}>Добавить сотрудника</Button>
		{/if}
	</div>

	<Card.Root>
		<Card.Content>
			<DirectoryTable
				rows={data.staff}
				{columns}
				canManage={data.canManage}
				emptyTitle="Сотрудников нет"
				nameOf={(row) => row.fullName}
				onEdit={(row) => (editing = row)}
			>
				{#snippet own(row: StaffDto, column: DataTableColumn)}
					{#if column.key === 'fullName'}
						{row.fullName}
						{#if row.hasAccount}
							<span class="text-xs text-fg-muted">· есть вход в систему</span>
						{/if}
					{:else if column.key === 'position'}
						{row.position ?? '—'}
					{/if}
				{/snippet}
			</DirectoryTable>
		</Card.Content>
	</Card.Root>
</div>

<StaffModal
	open={editing !== null}
	worker={editing === 'new' ? null : editing}
	onClose={() => (editing = null)}
/>
