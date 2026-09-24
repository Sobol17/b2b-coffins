<script lang="ts">
	import { enhance } from '$app/forms';
	import { colourTitle, positionTitle } from './labels';
	import { PRIORITY_TITLE } from '$lib/crm/requests/labels';
	import { Card, EmptyState, NumberInput, TONE_CLASS, TouchButton, withToast } from '$lib/ui';
	import { SHOP_PRODUCE_MAX, type ShopQueueRowDto } from '$lib/types/crm-shop';
	import { formatDayMonth, pluralRu } from '$lib/utils/format';

	let { queue, timeZone }: { queue: readonly ShopQueueRowDto[]; timeZone: string } = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Сделать</Card.Title>
		<Card.Description>
			Позиции, которых не хватает заявкам в работе. Срочные и ближние по сроку сверху.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		{#if queue.length === 0}
			<EmptyState title="Склад закрывает все заявки в работе" />
		{:else}
			<ul class="flex flex-col gap-3" data-testid="shop-queue">
				{#each queue as row (`${row.variantId}:${row.optionId}`)}
					<li
						class="flex flex-col gap-3 rounded-inset bg-surface-muted p-4"
						data-testid="shop-queue-row"
					>
						<div class="flex flex-wrap items-center gap-2">
							<span class="font-medium">{positionTitle(row)}</span>
							<span class="rounded-pill bg-chip px-3 py-0.5 text-xs">{colourTitle(row)}</span>
							{#if row.hasUrgent}
								<span class={['rounded-pill px-3 py-0.5 text-xs', TONE_CLASS.warning]}>
									{PRIORITY_TITLE.urgent}
								</span>
							{/if}
						</div>
						<p class="text-sm text-fg-muted">
							Не хватает <span class="font-heading text-lg text-fg" data-testid="shop-needed"
								>{row.neededQty}</span
							>
							· на складе {row.stockQty}
							· {row.requestCount}
							{pluralRu(row.requestCount, ['заявка', 'заявки', 'заявок'])}
							{#if row.nearestDeliveryAt}
								· срок {formatDayMonth(row.nearestDeliveryAt, timeZone)}
							{/if}
						</p>
						{#if row.canProduce}
							<form
								method="POST"
								action="?/produce"
								class="flex flex-wrap items-end gap-3"
								use:enhance={withToast({ success: 'Выпуск отмечен' })}
							>
								<input type="hidden" name="variantId" value={row.variantId} />
								<input type="hidden" name="optionId" value={row.optionId ?? ''} />
								<div class="w-28">
									<NumberInput
										label="Штук"
										name="qty"
										value={1}
										min={1}
										max={SHOP_PRODUCE_MAX}
										placeholder="Введите число"
									/>
								</div>
								<TouchButton type="submit" variant="primary">Сделано</TouchButton>
							</form>
						{:else}
							<p class="text-sm text-danger">
								У варианта нет складской позиции: свяжите её в каталоге.
							</p>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</Card.Content>
</Card.Root>
