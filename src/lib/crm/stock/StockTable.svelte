<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button, DataTable, TONE_CLASS, type DataTableColumn } from '$lib/ui';
	import type { StockRegistryRowDto } from '$lib/types/crm-stock';
	import type { ListQuery } from '$lib/types/list';
	import { formatMinor } from '$lib/utils/format';
	import StockDelete from './StockDelete.svelte';
	import { KIND_TITLE } from './labels';

	let {
		rows,
		total,
		query,
		onQueryChange,
		exportUrl,
		canSeeCost = false,
		canManage = false,
		onEdit
	}: {
		rows: readonly StockRegistryRowDto[];
		total: number;
		query: ListQuery;
		onQueryChange: (next: ListQuery) => void;
		exportUrl: string;
		/** Adds the cost column: owner and administrator only (v1.62). */
		canSeeCost?: boolean;
		canManage?: boolean;
		onEdit?: (item: StockRegistryRowDto['members'][number]) => void;
	} = $props();

	const columns: DataTableColumn[] = $derived([
		// The name goes first: a phone card takes the first column as its title.
		{ key: 'title', label: 'Название', sortable: true },
		{ key: 'code', label: 'Код', sortable: true },
		{ key: 'kind', label: 'Вид' },
		{ key: 'balance', label: 'Остаток', align: 'end' },
		{ key: 'minThreshold', label: 'Порог', align: 'end' },
		...(canSeeCost
			? [{ key: 'cost', label: 'Себестоимость', align: 'end' } satisfies DataTableColumn]
			: []),
		{ key: 'state', label: 'Состояние' }
	]);
</script>

<DataTable
	{columns}
	{rows}
	{total}
	{query}
	{onQueryChange}
	{exportUrl}
	emptyTitle="Позиций не найдено"
>
	{#snippet cell(row: StockRegistryRowDto, column: DataTableColumn)}
		{#if column.key === 'code'}
			<span class="text-fg-muted">{row.code}</span>
		{:else if column.key === 'title'}
			{#if row.modelId !== null}
				<details>
					<summary class="cursor-pointer font-medium text-link"
						>{row.title}
						<span class="text-xs text-fg-muted">· позиций: {row.members.length}</span></summary
					>
					<div class="mt-3 flex flex-col gap-4">
						{#each row.members as member (member.id)}
							<div class="border-l border-border pl-3">
								<a class="text-link" href={resolve(`/crm/stock/${member.id}`)}
									>{member.variantLabels.join(', ') || member.title}</a
								>
								<p class="text-xs text-fg-muted">
									{member.code} · {member.balance}
									{member.unitTitle}
								</p>
								{#each member.positions as position (position.optionId)}
									<p class={['text-sm', position.balance < 0 ? 'text-danger' : 'text-fg-muted']}>
										{position.colorTitle ?? 'Без цвета'}: {position.balance}
									</p>
								{/each}
								{#if canManage}<div class="mt-2 flex flex-wrap gap-2">
										<Button variant="secondary" size="sm" onclick={() => onEdit?.(member)}
											>Изменить</Button
										><StockDelete id={member.id} title={member.title} />
									</div>{/if}
							</div>
						{/each}
					</div>
				</details>
			{:else}
				<a
					class={['font-medium text-link hover:text-link-hover', !row.isActive && 'text-fg-muted']}
					href={resolve(`/crm/stock/${row.id}`)}>{row.title}</a
				>
				{#if canManage}<div class="mt-2 flex flex-wrap gap-2">
						<Button variant="secondary" size="sm" onclick={() => onEdit?.(row.members[0]!)}
							>Изменить</Button
						><StockDelete id={row.id} title={row.title} />
					</div>{/if}
			{/if}
		{:else if column.key === 'kind'}
			{KIND_TITLE[row.kind]}
		{:else if column.key === 'balance'}
			<span
				class={['font-medium', row.balance < 0 || row.isNegative ? 'text-danger' : '']}
				data-testid="stock-balance"
			>
				{row.balance}
			</span>
			<span class="text-xs text-fg-muted">{row.unitTitle}</span>
		{:else if column.key === 'cost'}
			<span class="tabular-nums" data-testid="stock-cost">
				{#if row.costRange}{formatMinor(row.costRange[0])}–{formatMinor(row.costRange[1])} ₽{:else}{row.costPriceMinor
						? `${formatMinor(row.costPriceMinor)} ₽`
						: '—'}{/if}
			</span>
		{:else if column.key === 'minThreshold'}
			{row.minThreshold === 0 ? '—' : row.minThreshold}
		{:else if column.key === 'state' && (row.isNegative || row.isBelowThreshold || !row.isActive)}
			<div class="flex flex-wrap gap-1">
				{#if row.isNegative}
					<span class={['rounded-pill px-2 py-0.5 text-xs', TONE_CLASS.danger]}>Минус</span>
				{/if}
				{#if row.isBelowThreshold}
					<span class={['rounded-pill px-2 py-0.5 text-xs', TONE_CLASS.warning]}>
						Ниже порога
					</span>
				{/if}
				{#if !row.isActive}
					<span class={['rounded-pill px-2 py-0.5 text-xs', TONE_CLASS.neutral]}>Выключена</span>
				{/if}
			</div>
		{/if}
	{/snippet}
</DataTable>
