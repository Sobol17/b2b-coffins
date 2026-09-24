<script lang="ts">
	import LineModal from './LineModal.svelte';
	import { Button, Card, DataTable, PriceCell, type DataTableColumn } from '$lib/ui';
	import type { CrmRequestCardDto, CrmRequestVariantChoice } from '$lib/types/crm-request';
	import type { RequestItemDto } from '$lib/types/request';

	let {
		card,
		variants,
		withMoney
	}: {
		card: CrmRequestCardDto;
		variants: readonly CrmRequestVariantChoice[];
		withMoney: boolean;
	} = $props();

	const editable = $derived(card.itemsEdit !== 'closed');
	const columns = $derived<DataTableColumn[]>([
		{ key: 'productTitle', label: 'Позиция' },
		{ key: 'options', label: 'Параметры' },
		{ key: 'qty', label: 'Кол-во', align: 'end' },
		...(withMoney
			? [
					{ key: 'unitPriceMinor', label: 'Цена', align: 'end' as const },
					{ key: 'lineTotalMinor', label: 'Сумма', align: 'end' as const }
				]
			: []),
		...(editable ? [{ key: 'edit', label: '' }] : [])
	]);
	const rows = $derived([...card.items]);

	let modalOpen = $state(false);
	let editing = $state<RequestItemDto | null>(null);

	function openLine(line: RequestItemDto | null): void {
		editing = line;
		modalOpen = true;
	}
</script>

<Card.Root>
	<Card.Header class="flex flex-row flex-wrap items-center gap-3">
		<div class="flex-1">
			<Card.Title>Состав</Card.Title>
			<Card.Description>
				{#if card.itemsEdit === 'free'}
					До приёма в работу цены пересчитываются по текущему прайсу.
				{:else if card.itemsEdit === 'controlled'}
					Заявка в работе: цены зафиксированы, изменение требует причины.
				{:else}
					Состав закрыт: изделие изготовлено или заявка вышла из потока.
				{/if}
			</Card.Description>
		</div>
		{#if editable}
			<Button variant="secondary" onclick={() => openLine(null)}>Добавить позицию</Button>
		{/if}
	</Card.Header>
	<Card.Content>
		<DataTable
			{columns}
			{rows}
			total={rows.length}
			query={{ page: 1, perPage: rows.length || 1 }}
			onQueryChange={() => {}}
			emptyTitle="В заявке нет позиций"
		>
			{#snippet cell(row, column)}
				{#if column.key === 'productTitle'}
					<span class="flex flex-col">
						<span>{row.productTitle}</span>
						<span class="text-xs text-fg-muted">{row.sku}</span>
					</span>
				{:else if column.key === 'options'}
					<span class="text-sm text-fg-muted">
						{[row.sizeCode, row.materialTitle, ...row.options.map((option) => option.title)].join(
							' · '
						)}
					</span>
				{:else if column.key === 'qty'}
					{row.qty} шт
				{:else if column.key === 'unitPriceMinor'}
					<PriceCell valueMinor={row.unitPriceMinor} />
				{:else if column.key === 'lineTotalMinor'}
					<PriceCell valueMinor={row.lineTotalMinor} />
				{:else}
					<Button variant="ghost" size="sm" onclick={() => openLine(row)}>Изменить</Button>
				{/if}
			{/snippet}
		</DataTable>
		{#if withMoney}
			<dl
				class="mt-4 grid max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm"
				data-testid="request-totals"
			>
				<dt class="text-fg-muted">Позиции</dt>
				<dd class="text-right"><PriceCell valueMinor={card.itemsTotalMinor} /></dd>
				<dt class="text-fg-muted">
					Скидка{card.discountPercent ? `, ${card.discountPercent} %` : ''}
				</dt>
				<dd class="text-right"><PriceCell valueMinor={card.discountMinor} /></dd>
				<dt class="font-medium">К оплате</dt>
				<dd class="text-right font-medium"><PriceCell valueMinor={card.totalMinor} /></dd>
			</dl>
		{/if}
	</Card.Content>
</Card.Root>

{#key editing}
	<LineModal bind:open={modalOpen} line={editing} mode={card.itemsEdit} {variants} />
{/key}
