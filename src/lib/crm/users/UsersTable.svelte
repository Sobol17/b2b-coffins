<script lang="ts">
	import { enhance } from '$app/forms';
	import { ROLE_TITLE, USER_STATUS_OPTIONS, USER_STATUS_TONE } from '$lib/crm/labels';
	import EntityList from '$lib/crm/EntityList.svelte';
	import { Button, TONE_CLASS, withToast } from '$lib/ui';
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

	const statusLabel = (status: CrmUserDto['status']) =>
		USER_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
</script>

<EntityList {rows} paging={{ total, query, onQueryChange }} emptyTitle="Пользователей не найдено">
	{#snippet item(row: CrmUserDto)}
		<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
			<span class="font-medium">{row.fullName}</span>
			<span
				data-testid="user-status"
				class={[
					'inline-flex rounded-pill px-2.5 py-0.5 text-xs',
					TONE_CLASS[USER_STATUS_TONE[row.status]]
				]}
			>
				{statusLabel(row.status)}
			</span>
		</div>
		<div class="text-sm text-fg-muted">
			<span data-testid="user-roles">{row.roles.map((role) => ROLE_TITLE[role]).join(', ')}</span>
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
	{#snippet actions(row: CrmUserDto)}
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
	{/snippet}
</EntityList>
