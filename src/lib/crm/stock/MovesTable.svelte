<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { Button, DataTable, Modal, TONE_CLASS, withToast, type DataTableColumn } from '$lib/ui';
	import type { StockMoveDto } from '$lib/types/crm-stock';
	import type { ListQuery } from '$lib/types/list';
	import { formatDateTime } from '$lib/utils/format';
	import { formatMilli } from '$lib/utils/milli';
	import { MOVE_TYPE_TITLE, signed } from './labels';

	/**
	 * The journal of an item: every move its balance is made of (C8 DoD). A mistaken manual move is
	 * cancelled by a reversal row, the move itself stays in the list.
	 */
	let {
		rows,
		total,
		query,
		onQueryChange,
		exportUrl,
		timeZone
	}: {
		rows: readonly StockMoveDto[];
		total: number;
		query: ListQuery;
		onQueryChange: (next: ListQuery) => void;
		exportUrl: string;
		timeZone: string;
	} = $props();

	const columns: DataTableColumn[] = [
		{ key: 'occurredAt', label: 'Дата' },
		{ key: 'type', label: 'Тип' },
		{ key: 'color', label: 'Цвет' },
		{ key: 'qty', label: 'Количество', align: 'end' },
		{ key: 'basis', label: 'Основание' },
		{ key: 'actor', label: 'Кто' },
		{ key: 'actions', label: 'Действия', align: 'end' }
	];

	let reversing = $state<StockMoveDto | null>(null);
	let reverseOpen = $state(false);
</script>

<DataTable
	{columns}
	{rows}
	{total}
	{query}
	{onQueryChange}
	{exportUrl}
	emptyTitle="Движений по позиции нет"
>
	{#snippet cell(row: StockMoveDto, column: DataTableColumn)}
		{#if column.key === 'occurredAt'}
			{formatDateTime(row.occurredAt, timeZone)}
		{:else if column.key === 'type'}
			{MOVE_TYPE_TITLE[row.type]}
			{#if row.isReversed}
				<span class={['ms-1 rounded-pill px-2 py-0.5 text-xs', TONE_CLASS.warning]}>
					Сторнировано
				</span>
			{/if}
		{:else if column.key === 'color'}
			{row.colorTitle ?? '—'}
		{:else if column.key === 'qty'}
			<span
				class={['font-medium', row.isReversed ? 'text-fg-muted line-through' : '']}
				data-testid="move-qty"
			>
				{signed(row.qty)}
			</span>
			{#if row.consumedMilli !== null}
				<div class="text-xs text-fg-muted">по норме {formatMilli(row.consumedMilli)}</div>
			{/if}
		{:else if column.key === 'basis'}
			{#if row.requestId !== null}
				<a class="text-link" href={resolve(`/crm/requests/${row.requestId}`)}>
					Заявка {row.requestNumber}
				</a>
			{:else}
				<div>{row.reasonTitle ?? '—'}</div>
			{/if}
			{#if row.comment}<div class="text-xs text-fg-muted">{row.comment}</div>{/if}
		{:else if column.key === 'actor'}
			{row.actorName ?? '—'}
		{:else if column.key === 'actions'}
			{#if row.canReverse}
				<Button
					variant="ghost"
					size="sm"
					class="text-danger"
					onclick={() => {
						reversing = row;
						reverseOpen = true;
					}}
				>
					Сторнировать
				</Button>
			{/if}
		{/if}
	{/snippet}
</DataTable>

<Modal bind:open={reverseOpen} title="Сторнировать движение">
	{#snippet body()}
		<form
			method="POST"
			action="?/reverse"
			class="flex flex-col gap-4"
			use:enhance={withToast({
				success: 'Движение сторнировано',
				onSuccess: () => (reverseOpen = false)
			})}
		>
			<input type="hidden" name="moveId" value={reversing?.id} />
			<p class="text-sm text-fg-muted">
				Движение {reversing ? signed(reversing.qty) : ''} останется в журнале, рядом появится строка с
				обратным количеством.
			</p>
			<Button type="submit" variant="danger" class="self-start">Сторнировать</Button>
		</form>
	{/snippet}
</Modal>
