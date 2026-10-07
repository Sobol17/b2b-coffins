<script lang="ts">
	import { enhance } from '$app/forms';
	import { ROLE_TITLE, USER_STATUS_OPTIONS, USER_STATUS_TONE } from '$lib/crm/labels';
	import EntityList from '$lib/crm/EntityList.svelte';
	import { Button, Card, TONE_CLASS, withToast } from '$lib/ui';
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
		<EntityList rows={users} emptyTitle="Пользователей нет">
			{#snippet item(row: StaffMemberDto)}
				<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
					<span class="font-medium">{row.fullName}</span>
					<span
						class={[
							'inline-flex rounded-pill px-2.5 py-0.5 text-xs',
							TONE_CLASS[USER_STATUS_TONE[row.status]]
						]}
					>
						{statusLabel(row.status)}
					</span>
				</div>
				<div class="text-sm text-fg-muted">
					<span data-testid="member-role">{ROLE_TITLE[row.role]}</span>
				</div>
				<div class="text-xs text-fg-faint">
					{row.email}{row.phone ? `, ${row.phone}` : ''}
				</div>
				<div class="text-xs text-fg-faint">
					{row.lastLoginAt
						? `Последний вход ${formatDateTime(row.lastLoginAt, timeZone)}`
						: 'Ещё не входил'}
				</div>
			{/snippet}
			{#snippet actions(row: StaffMemberDto)}
				{#if row.status !== 'disabled'}
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
				{/if}
			{/snippet}
		</EntityList>
	</Card.Content>
</Card.Root>

<IssueAdminModal bind:open={issueOpen} />
