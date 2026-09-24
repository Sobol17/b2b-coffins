<script lang="ts">
	import { enhance } from '$app/forms';
	import { ROLE_TITLE, USER_STATUS_OPTIONS, USER_STATUS_TONE } from '$lib/crm/labels';
	import { Button, DataTable, TONE_CLASS, withToast, type DataTableColumn } from '$lib/ui';
	import type { CrmUserDto } from '$lib/types/crm';
	import type { ListQuery } from '$lib/types/list';
	import { formatDateTime } from '$lib/utils/format';

	let {
		rows,
		total,
		query,
		onQueryChange,
		onEditRoles,
		timeZone
	}: {
		rows: readonly CrmUserDto[];
		total: number;
		query: ListQuery;
		onQueryChange: (next: ListQuery) => void;
		onEditRoles: (user: CrmUserDto) => void;
		timeZone: string;
	} = $props();

	const columns: DataTableColumn[] = [
		{ key: 'fullName', label: 'Пользователь', sortable: true },
		{ key: 'roles', label: 'Роли' },
		{ key: 'phone', label: 'Телефон' },
		{ key: 'lastLoginAt', label: 'Последний вход', sortable: true },
		{ key: 'status', label: 'Статус' },
		{ key: 'actions', label: 'Действия', align: 'end' }
	];

	const statusLabel = (status: CrmUserDto['status']) =>
		USER_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
</script>

<DataTable {columns} {rows} {total} {query} {onQueryChange} emptyTitle="Пользователей не найдено">
	{#snippet cell(row: CrmUserDto, column: DataTableColumn)}
		{#if column.key === 'fullName'}
			<div>{row.fullName}</div>
			<div class="text-xs text-fg-faint">{row.email}</div>
		{:else if column.key === 'roles'}
			<span data-testid="user-roles">{row.roles.map((role) => ROLE_TITLE[role]).join(', ')}</span>
		{:else if column.key === 'phone'}
			{row.phone ?? '—'}
		{:else if column.key === 'lastLoginAt'}
			{row.lastLoginAt ? formatDateTime(row.lastLoginAt, timeZone) : '—'}
		{:else if column.key === 'status'}
			<span
				data-testid="user-status"
				class={[
					'inline-flex rounded-pill px-3 py-1 text-xs',
					TONE_CLASS[USER_STATUS_TONE[row.status]]
				]}
			>
				{statusLabel(row.status)}
			</span>
		{:else if column.key === 'actions'}
			<div class="flex flex-wrap justify-end gap-2">
				<Button variant="secondary" size="sm" onclick={() => onEditRoles(row)}>Роли</Button>
				<!-- The own account keeps only the roles button: the server refuses the rest too. -->
				{#if !row.isSelf}
					<form
						method="POST"
						action="?/reset"
						use:enhance={withToast({ success: `Пароль сброшен: ${row.fullName}` })}
					>
						<input type="hidden" name="id" value={row.id} />
						<Button type="submit" variant="ghost" size="sm">Сбросить пароль</Button>
					</form>
					<form
						method="POST"
						action={row.status === 'disabled' ? '?/enable' : '?/disable'}
						use:enhance={withToast({
							success:
								row.status === 'disabled'
									? `Доступ включён: ${row.fullName}`
									: `Доступ отключён: ${row.fullName}`
						})}
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
				{/if}
			</div>
		{/if}
	{/snippet}
</DataTable>
