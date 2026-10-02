<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, DataTable, Input, Modal, withToast, type DataTableColumn } from '$lib/ui';
	import type { BomNormDto } from '$lib/types/crm-bom';
	import type { ListQuery } from '$lib/types/list';
	import { formatMilli } from '$lib/utils/milli';
	import { milliWithUnit } from './labels';

	/**
	 * Norms of one version (C9). Only the active version is edited, in place; the pair of a norm
	 * stays as created, so the edit form changes the quantity alone.
	 */
	let {
		rows,
		total,
		query,
		onQueryChange,
		canEdit
	}: {
		rows: readonly BomNormDto[];
		total: number;
		query: ListQuery;
		onQueryChange: (next: ListQuery) => void;
		canEdit: boolean;
	} = $props();

	const columns = $derived<DataTableColumn[]>([
		{ key: 'variant', label: 'Вариант' },
		{ key: 'component', label: 'Комплектующее' },
		{ key: 'qty', label: 'Норма на единицу', align: 'end' },
		...(canEdit ? [{ key: 'actions', label: 'Действия', align: 'end' } as const] : [])
	]);

	let editing = $state<BomNormDto | null>(null);
	let editOpen = $state(false);
	let removing = $state<BomNormDto | null>(null);
	let removeOpen = $state(false);
	let qtyText = $state('');
</script>

<DataTable {columns} {rows} {total} {query} {onQueryChange} emptyTitle="В версии нет норм">
	{#snippet cell(row: BomNormDto, column: DataTableColumn)}
		{#if column.key === 'variant'}
			<div>{row.variantSku}</div>
			<div class="text-xs text-fg-muted">{row.productTitle}</div>
		{:else if column.key === 'component'}
			<div>{row.componentTitle}</div>
			<div class="text-xs text-fg-muted">{row.componentCode}</div>
		{:else if column.key === 'qty'}
			<span class="font-medium" data-testid="norm-qty">
				{milliWithUnit(row.qtyPerUnitMilli, row.unitTitle)}
			</span>
		{:else if column.key === 'actions'}
			<div class="flex justify-end gap-1">
				<Button
					variant="ghost"
					size="sm"
					onclick={() => {
						editing = row;
						qtyText = formatMilli(row.qtyPerUnitMilli);
						editOpen = true;
					}}
				>
					Изменить
				</Button>
				<Button
					variant="ghost"
					size="sm"
					class="text-danger"
					onclick={() => {
						removing = row;
						removeOpen = true;
					}}
				>
					Удалить
				</Button>
			</div>
		{/if}
	{/snippet}
</DataTable>

<Modal
	bind:open={editOpen}
	title="Изменить норму"
	description={editing ? `${editing.variantSku} · ${editing.componentTitle}` : ''}
>
	{#snippet body()}
		<form
			method="POST"
			action="?/normUpdate"
			class="flex flex-col gap-4"
			use:enhance={withToast({
				success: 'Норма изменена',
				onSuccess: () => (editOpen = false)
			})}
		>
			<input type="hidden" name="normId" value={editing?.id} />
			<Input
				name="qtyPerUnitMilli"
				label={`Норма на единицу, ${editing?.unitTitle ?? ''}`}
				placeholder="Введите норму"
				required
				bind:value={qtyText}
			/>
			<p class="text-sm text-fg-muted">
				Прежние списания останутся как были. Новая норма действует со следующей отметки выпуска.
			</p>
			<Button type="submit" class="self-start">Сохранить норму</Button>
		</form>
	{/snippet}
</Modal>

<Modal bind:open={removeOpen} title="Удалить норму">
	{#snippet body()}
		<form
			method="POST"
			action="?/normDelete"
			class="flex flex-col gap-4"
			use:enhance={withToast({
				success: 'Норма удалена',
				onSuccess: () => (removeOpen = false)
			})}
		>
			<input type="hidden" name="normId" value={removing?.id} />
			<p class="text-sm text-fg-muted">
				{removing?.componentTitle} перестанет списываться при выпуске {removing?.variantSku}.
			</p>
			<Button type="submit" variant="danger" class="self-start">Удалить норму</Button>
		</form>
	{/snippet}
</Modal>
