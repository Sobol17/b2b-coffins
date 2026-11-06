<script lang="ts">
	import { enhance } from '$app/forms';
	import { ROLE_TITLE } from '$lib/crm/labels';
	import { Button, DataTable, TONE_CLASS, withToast, type DataTableColumn } from '$lib/ui';
	import type { WorkTypeDto } from '$lib/types/crm-payroll';
	import { WORK_ROLES, type WorkRole } from '$lib/types/roles';
	import { roubles } from './labels';
	import type { WorkMatrixPosition } from './work-matrix';

	let {
		positions,
		canManage,
		onEdit
	}: {
		positions: readonly WorkMatrixPosition[];
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
	total={positions.length}
	query={{ page: 1, perPage: Math.max(1, positions.length) }}
	onQueryChange={() => undefined}
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
			<div
				class="flex min-w-32 flex-col items-start gap-1.5 max-sm:items-end"
				data-testid="work-rate-cell"
			>
				{#if work}
					<span class="font-medium tabular-nums" data-testid="work-rate"
						>{roubles(work.rateMinor)}</span
					>
					{#if !work.isActive}
						<span
							data-testid="directory-status"
							class={['rounded-pill px-2.5 py-0.5 text-xs', TONE_CLASS.neutral]}>Выключена</span
						>
					{/if}
					<span class="max-w-44 text-xs whitespace-normal text-fg-muted">{work.title}</span>
					{#if canManage}
						<div class="flex flex-wrap gap-1 max-sm:justify-end">
							<Button variant="secondary" size="sm" onclick={() => onEdit(work)}>Изменить</Button>
							<form
								method="POST"
								action={work.isActive ? '?/disable' : '?/enable'}
								use:enhance={withToast({
									success: (result) =>
										result?.action === 'disable'
											? `Выключено: ${work.title}`
											: `Включено: ${work.title}`
								})}
							>
								<input type="hidden" name="id" value={work.id} />
								<Button
									type="submit"
									variant="ghost"
									size="sm"
									class={work.isActive ? 'text-danger' : undefined}
								>
									{work.isActive ? 'Выключить' : 'Включить'}
								</Button>
							</form>
						</div>
					{/if}
				{:else}
					<span class="text-sm text-fg-faint" data-testid="work-rate-missing">Не задана</span>
				{/if}
			</div>
		{/if}
	{/snippet}
</DataTable>
