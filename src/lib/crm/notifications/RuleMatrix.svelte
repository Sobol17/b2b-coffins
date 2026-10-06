<script lang="ts">
	import { ROLE_TITLE } from '$lib/crm/labels';
	import { CHANNEL_LABEL, EVENT_LABEL } from '$lib/notifications/labels';
	import { DataTable, TONE_CLASS, type DataTableColumn } from '$lib/ui';
	import type { NotificationRuleCellDto } from '$lib/types/crm-notifications';
	import { EVENT_KEYS, type EventKey } from '$lib/types/events';
	import { ROLE_CODES, type RoleCode } from '$lib/types/roles';

	/*
	 * The matrix of tech.md 7.3, read only: one row per event, one column per role a rule names.
	 * The seed owns the rules, so there is nothing to switch here.
	 */
	let { cells }: { cells: readonly NotificationRuleCellDto[] } = $props();

	interface Row {
		id: EventKey;
		byRole: Map<RoleCode, NotificationRuleCellDto[]>;
	}

	const roles = $derived(ROLE_CODES.filter((role) => cells.some((cell) => cell.roleCode === role)));
	const columns = $derived<DataTableColumn[]>([
		{ key: 'event', label: 'Событие' },
		...roles.map((role) => ({ key: role, label: ROLE_TITLE[role] }))
	]);
	const rows = $derived<Row[]>(
		EVENT_KEYS.map((eventKey) => ({
			id: eventKey,
			byRole: new Map(
				roles.map((role) => [
					role,
					cells.filter((cell) => cell.eventKey === eventKey && cell.roleCode === role)
				])
			)
		}))
	);

	function isRole(key: string): key is RoleCode {
		return (ROLE_CODES as readonly string[]).includes(key);
	}
</script>

<!-- Every event is on the page: nothing to page or sort. -->
<DataTable
	{columns}
	{rows}
	total={rows.length}
	query={{ page: 1, perPage: rows.length }}
	onQueryChange={() => undefined}
	emptyTitle="Правил пока нет"
>
	{#snippet cell(row: Row, column: DataTableColumn)}
		{#if column.key === 'event'}
			<div>{EVENT_LABEL[row.id].title}</div>
			<div class="text-xs text-fg-faint">{EVENT_LABEL[row.id].hint}</div>
		{:else if isRole(column.key)}
			{@const rules = row.byRole.get(column.key) ?? []}
			{#if rules.length === 0}
				<span class="text-fg-faint">—</span>
			{:else}
				<div class="flex flex-wrap gap-1" data-testid="matrix-cell">
					<span class={['inline-flex rounded-pill px-3 py-1 text-xs', TONE_CLASS.info]}>
						Колокольчик
					</span>
					{#each rules as rule (rule.channel)}
						<span
							class={[
								'inline-flex rounded-pill px-3 py-1 text-xs',
								TONE_CLASS[rule.enabled ? 'success' : 'neutral']
							]}
							title={rule.isLive ? undefined : 'Канал заработает позже'}
						>
							{CHANNEL_LABEL[rule.channel]}{rule.enabled ? '' : ': выключен'}
						</span>
					{/each}
				</div>
			{/if}
		{/if}
	{/snippet}
</DataTable>
