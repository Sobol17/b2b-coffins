<script lang="ts">
	import type { ListQuery } from '$lib/types/list';
	import { ROLE_TITLE } from '$lib/crm/labels';
	import { Button, DataTable, type DataTableColumn } from '$lib/ui';
	import type { WorkTypeDto } from '$lib/types/crm-payroll';
	import { WORK_ROLES, type WorkRole } from '$lib/types/roles';
	import { roubles } from './labels';
	import type { WorkMatrixPosition } from './work-matrix';

	let {
		positions,
		canManage,
		onEdit,
		total,
		query,
		onQueryChange
	}: {
		positions: readonly WorkMatrixPosition[];
		total: number;
		query: ListQuery;
		onQueryChange: (next: ListQuery) => void;
		canManage: boolean;
		onEdit: (work: WorkTypeDto) => void;
	} = $props();

	const columns: DataTableColumn[] = [
		{ key: 'position', label: 'Позиция каталога' },
		...WORK_ROLES.map((role) => ({ key: role, label: ROLE_TITLE[role] }))
	];
	function isWorkRole(key: string): key is WorkRole {
		return (WORK_ROLES as readonly string[]).includes(key);
	}
</script>

<DataTable
	{columns}
	rows={positions}
	{total}
	{query}
	{onQueryChange}
	emptyTitle="Позиции не найдены"
>
	{#snippet cell(row: WorkMatrixPosition, column: DataTableColumn)}
		{#if column.key === 'position'}
			<div class="min-w-40 whitespace-normal" data-testid="work-variant">{row.label}</div>
			{#if !row.available}
				<div class="mt-1 text-xs text-fg-faint">Недоступна для новых привязок</div>
			{/if}
		{:else if isWorkRole(column.key)}
			{@const work = row.rates[column.key]}
			<div class="flex min-w-20 items-center gap-1 max-sm:justify-end" data-testid="work-rate-cell">
				{#if work}
					{#if canManage}
						<Button
							variant="ghost"
							size="sm"
							class="min-h-11 font-medium tabular-nums"
							aria-label={`Изменить: ${ROLE_TITLE[column.key]} · ${row.label}`}
							title={work.title}
							onclick={() => onEdit(work)}
						>
							<span data-testid="work-rate">{roubles(work.rateMinor)}</span>
							{#if !work.isActive}<span class="text-xs text-fg-faint" data-testid="directory-status"
									>Выключена</span
								>{/if}
						</Button>
					{:else}<span class="tabular-nums" data-testid="work-rate">{roubles(work.rateMinor)}</span
						>{/if}
				{:else}<span class="text-sm text-fg-faint" data-testid="work-rate-missing">Не задана</span
					>{/if}
			</div>
		{/if}
	{/snippet}
</DataTable>
