<script lang="ts">
	import { AUDIT_ACTION_TITLE, AUDIT_ENTITY_TITLE } from '$lib/crm/labels';
	import { DataTable, type DataTableColumn } from '$lib/ui';
	import type { AuditEntryDto } from '$lib/types/crm';
	import type { ListQuery } from '$lib/types/list';
	import { formatDateTime } from '$lib/utils/format';
	import { changeLines } from './changes';

	let {
		rows,
		total,
		query,
		onQueryChange,
		timeZone
	}: {
		rows: readonly AuditEntryDto[];
		total: number;
		query: ListQuery;
		onQueryChange: (next: ListQuery) => void;
		timeZone: string;
	} = $props();

	const columns: DataTableColumn[] = [
		{ key: 'createdAt', label: 'Когда' },
		{ key: 'actorName', label: 'Кто' },
		{ key: 'action', label: 'Действие' },
		{ key: 'entity', label: 'Объект' },
		{ key: 'changes', label: 'Изменения' },
		{ key: 'ip', label: 'IP' }
	];
</script>

<DataTable {columns} {rows} {total} {query} {onQueryChange} emptyTitle="Записей не найдено">
	{#snippet cell(row: AuditEntryDto, column: DataTableColumn)}
		{#if column.key === 'createdAt'}
			<span class="whitespace-nowrap">{formatDateTime(row.createdAt, timeZone)}</span>
		{:else if column.key === 'actorName'}
			{row.actorName ?? 'Система'}
		{:else if column.key === 'action'}
			<span data-testid="audit-action">{AUDIT_ACTION_TITLE[row.action] ?? row.action}</span>
		{:else if column.key === 'entity'}
			{AUDIT_ENTITY_TITLE[row.entity] ?? row.entity}{row.entityId === null
				? ''
				: ` № ${row.entityId}`}
		{:else if column.key === 'changes'}
			<ul class="flex flex-col gap-1 text-xs" data-testid="audit-changes">
				{#each changeLines(row.before, row.after) as line (line.key)}
					<li>
						<span class="text-fg-faint">{line.key}:</span>
						{#if line.before !== null}<span class="line-through">{line.before}</span>{/if}
						{#if line.before !== null && line.after !== null}→{/if}
						{#if line.after !== null}<span>{line.after}</span>{/if}
					</li>
				{/each}
			</ul>
		{:else if column.key === 'ip'}
			{row.ip ?? '—'}
		{/if}
	{/snippet}
</DataTable>
