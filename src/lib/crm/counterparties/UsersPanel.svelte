<script lang="ts">
	import { enhance } from '$app/forms';
	import { ROLE_TITLE, USER_STATUS_OPTIONS, USER_STATUS_TONE } from '$lib/crm/labels';
	import { Button, Card, DataTable, TONE_CLASS, withToast, type DataTableColumn } from '$lib/ui';
	import type { StaffMemberDto } from '$lib/types/counterparty';
	import { formatDateTime } from '$lib/utils/format';
	import IssueAdminModal from './IssueAdminModal.svelte';

	/*
	 * People of the counterparty. The workshop issues administrators and resends access; disabling
	 * and demoting stay with the counterparty administrator in the portal (P2).
	 */
	let {
		users,
		staffLimit,
		timeZone
	}: { users: readonly StaffMemberDto[]; staffLimit: number; timeZone: string } = $props();

	let issueOpen = $state(false);
	const activeCount = $derived(users.filter((user) => user.status !== 'disabled').length);
	// The whole list fits on one page: it is capped by the staff limit.
	const query = $derived({ page: 1, perPage: Math.max(users.length, 1) });
	const columns: DataTableColumn[] = [
		{ key: 'fullName', label: 'Сотрудник' },
		{ key: 'role', label: 'Роль' },
		{ key: 'lastLoginAt', label: 'Последний вход' },
		{ key: 'status', label: 'Статус' },
		{ key: 'actions', label: 'Действия', align: 'end' }
	];
	const statusLabel = (status: StaffMemberDto['status']) =>
		USER_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
</script>

<Card.Root>
	<Card.Header class="flex flex-row flex-wrap items-center gap-3">
		<div class="flex-1">
			<Card.Title>Пользователи портала</Card.Title>
			<Card.Description data-testid="staff-seats"
				>Активных {activeCount} из {staffLimit}</Card.Description
			>
		</div>
		<Button
			variant="secondary"
			onclick={() => (issueOpen = true)}
			disabled={activeCount >= staffLimit}
		>
			Выдать администратора
		</Button>
	</Card.Header>
	<Card.Content>
		<DataTable
			{columns}
			rows={users}
			total={users.length}
			{query}
			onQueryChange={() => {}}
			emptyTitle="Пользователей нет"
		>
			{#snippet cell(row: StaffMemberDto, column: DataTableColumn)}
				{#if column.key === 'fullName'}
					<div>{row.fullName}</div>
					<div class="text-xs text-fg-faint">{row.email}{row.phone ? ` · ${row.phone}` : ''}</div>
				{:else if column.key === 'role'}
					<span data-testid="member-role">{ROLE_TITLE[row.role]}</span>
				{:else if column.key === 'lastLoginAt'}
					{row.lastLoginAt ? formatDateTime(row.lastLoginAt, timeZone) : '—'}
				{:else if column.key === 'status'}
					<span
						class={[
							'inline-flex rounded-pill px-3 py-1 text-xs',
							TONE_CLASS[USER_STATUS_TONE[row.status]]
						]}
					>
						{statusLabel(row.status)}
					</span>
				{:else if column.key === 'actions' && row.status !== 'disabled'}
					<div class="flex flex-wrap justify-end gap-2">
						{#if row.role !== 'cp_admin'}
							<form
								method="POST"
								action="?/adminPromote"
								use:enhance={withToast({ success: `Администратор: ${row.fullName}` })}
							>
								<input type="hidden" name="id" value={row.id} />
								<Button type="submit" variant="ghost" size="sm">Сделать администратором</Button>
							</form>
						{/if}
						<form
							method="POST"
							action="?/accessResend"
							use:enhance={withToast({ success: `Доступ отправлен: ${row.fullName}` })}
						>
							<input type="hidden" name="id" value={row.id} />
							<Button type="submit" variant="ghost" size="sm">Отправить доступ</Button>
						</form>
					</div>
				{/if}
			{/snippet}
		</DataTable>
	</Card.Content>
</Card.Root>

<IssueAdminModal bind:open={issueOpen} />
