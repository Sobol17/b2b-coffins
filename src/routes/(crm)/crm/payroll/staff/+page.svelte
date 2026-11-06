<script lang="ts">
	import SectionTabs from '$lib/crm/SectionTabs.svelte';
	import { PAYROLL_TABS } from '$lib/crm/sections';
	import DirectoryTable from '$lib/crm/payroll/DirectoryTable.svelte';
	import StaffModal from '$lib/crm/payroll/StaffModal.svelte';
	import { Button, Card } from '$lib/ui';
	import type { StaffDto } from '$lib/types/crm-payroll';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// null: closed; 'new': a new worker; a worker: the edit of that one.
	let editing = $state<StaffDto | 'new' | null>(null);
	const accountNames = $derived(new Map(data.users.map((user) => [user.id, user.fullName])));
</script>

<svelte:head><title>Сотрудники</title></svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
	<SectionTabs tabs={PAYROLL_TABS} label="Выплаты" />
	<div class="flex flex-wrap items-end gap-4">
		<div>
			<h1 class="mb-2 text-3xl">Сотрудники</h1>
			<p class="max-w-2xl text-fg-muted">
				Те, кого отмечают в рабочем дне. Сотрудник, который больше не работает, выключается: его дни
				и выплаты остаются в ведомостях.
			</p>
		</div>
		{#if data.canManage}
			<Button
				class="sm:ml-auto"
				onclick={() => {
					form = null;
					editing = 'new';
				}}>Добавить сотрудника</Button
			>
		{/if}
	</div>

	<Card.Root>
		<Card.Content>
			<DirectoryTable
				rows={data.staff}
				canManage={data.canManage}
				statusTitle={{ on: 'Работает', off: 'Выключен' }}
				emptyTitle="Сотрудников нет"
				nameOf={(row) => row.fullName}
				onEdit={(row) => {
					form = null;
					editing = row;
				}}
			>
				{#snippet own(row: StaffDto)}
					{row.position ?? 'Должность не указана'}
					<div data-testid="staff-account" class="text-xs text-fg-faint">
						{row.userId
							? `Учётная запись: ${accountNames.get(row.userId) ?? 'недоступна'}`
							: 'Без учётной записи'}
					</div>
				{/snippet}
			</DirectoryTable>
		</Card.Content>
	</Card.Root>
</div>

<StaffModal
	open={editing !== null}
	worker={editing === 'new' ? null : editing}
	users={data.users}
	formError={form && 'formError' in form && (form.action === 'create' || form.action === 'update')
		? form.formError
		: undefined}
	onClose={() => (editing = null)}
/>
