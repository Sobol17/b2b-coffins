<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, DataTable, TONE_CLASS, type DataTableColumn } from '$lib/ui';
	import type { StaffMemberDto } from '$lib/types/counterparty';
	import type { ListQuery } from '$lib/types/list';
	import { formatDateTime } from '$lib/utils/format';
	import { ROLE_LABEL, STATUS_LABEL, STATUS_TONE } from './labels';

	let {
		rows,
		total,
		query,
		onQueryChange,
		timeZone
	}: {
		rows: readonly StaffMemberDto[];
		total: number;
		query: ListQuery;
		onQueryChange: (next: ListQuery) => void;
		timeZone: string;
	} = $props();

	const columns: DataTableColumn[] = [
		{ key: 'fullName', label: 'Сотрудник', sortable: true },
		{ key: 'role', label: 'Роль' },
		{ key: 'phone', label: 'Телефон' },
		{ key: 'lastLoginAt', label: 'Последний вход', sortable: true },
		{ key: 'status', label: 'Статус' },
		{ key: 'actions', label: 'Действия', align: 'end' }
	];
</script>

<DataTable {columns} {rows} {total} {query} {onQueryChange} emptyTitle="Сотрудников не найдено">
	{#snippet cell(row: StaffMemberDto, column: DataTableColumn)}
		{#if column.key === 'fullName'}
			<div>{row.fullName}</div>
			<div class="text-xs text-fg-faint">{row.email}</div>
		{:else if column.key === 'role'}
			{ROLE_LABEL[row.role]}
		{:else if column.key === 'phone'}
			{row.phone ?? '—'}
		{:else if column.key === 'lastLoginAt'}
			{row.lastLoginAt ? formatDateTime(row.lastLoginAt, timeZone) : '—'}
		{:else if column.key === 'status'}
			<span
				data-testid="staff-status"
				class={['inline-flex rounded-pill px-3 py-1 text-xs', TONE_CLASS[STATUS_TONE[row.status]]]}
			>
				{STATUS_LABEL[row.status]}
			</span>
		{:else if column.key === 'actions' && !row.isSelf}
			<!-- The own row has no actions: the server refuses them too (StaffService.requireOther). -->
			<div class="flex flex-wrap justify-end gap-2">
				<form method="POST" action="?/role" use:enhance>
					<input type="hidden" name="id" value={row.id} />
					<input
						type="hidden"
						name="role"
						value={row.role === 'cp_admin' ? 'cp_employee' : 'cp_admin'}
					/>
					<Button type="submit" variant="secondary" size="sm">
						{row.role === 'cp_admin' ? 'Сделать сотрудником' : 'Сделать администратором'}
					</Button>
				</form>
				<form
					method="POST"
					action={row.status === 'disabled' ? '?/enable' : '?/disable'}
					use:enhance
				>
					<input type="hidden" name="id" value={row.id} />
					<Button
						type="submit"
						variant="ghost"
						size="sm"
						class={row.status === 'disabled' ? undefined : 'text-danger'}
					>
						{row.status === 'disabled' ? 'Включить' : 'Отключить'}
					</Button>
				</form>
			</div>
		{/if}
	{/snippet}
</DataTable>
