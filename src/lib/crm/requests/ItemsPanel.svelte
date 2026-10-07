<script lang="ts">
	import LineModal from './LineModal.svelte';
	import EntityList from '$lib/crm/EntityList.svelte';
	import { Button, Card, PriceCell } from '$lib/ui';
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
		<EntityList {rows} emptyTitle="В заявке нет позиций" actions={editable ? edit : undefined}>
			{#snippet item(row: RequestItemDto)}
				<div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
					<div class="min-w-0">
						<div class="font-medium">{row.productTitle}</div>
						<div class="text-sm text-fg-muted">
							{[row.sizeCode, row.materialTitle, ...row.options.map((option) => option.title)].join(
								' · '
							)}
						</div>
						<div class="text-xs text-fg-faint">{row.sku}</div>
					</div>
					<div class="text-right tabular-nums">
						<div class="font-medium">{row.qty} шт</div>
						{#if withMoney}
							<div class="text-sm text-fg-muted">
								<PriceCell valueMinor={row.unitPriceMinor} /> за штуку
							</div>
							<div><PriceCell valueMinor={row.lineTotalMinor} /></div>
						{/if}
					</div>
				</div>
			{/snippet}
		</EntityList>
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

{#snippet edit(row: RequestItemDto)}
	<Button variant="ghost" size="sm" onclick={() => openLine(row)}>Изменить</Button>
{/snippet}

{#key editing}
	<LineModal bind:open={modalOpen} line={editing} mode={card.itemsEdit} {variants} />
{/key}
