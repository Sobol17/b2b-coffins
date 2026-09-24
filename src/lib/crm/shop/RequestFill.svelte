<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { colourTitle, positionTitle } from './labels';
	import { PRIORITY_TITLE, STOCK_TITLE } from '$lib/crm/requests/labels';
	import { Card, EmptyState, TONE_CLASS, TouchButton, withToast } from '$lib/ui';
	import type { ShopRequestDto } from '$lib/types/crm-shop';
	import { formatDayMonth } from '$lib/utils/format';

	let {
		requests,
		total,
		timeZone
	}: { requests: readonly ShopRequestDto[]; total: number; timeZone: string } = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Заявки в работе</Card.Title>
		<Card.Description>
			Склад наполняет заявки по приоритету. Наполненную целиком заявку отметьте собранной.
		</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-3">
		{#each requests as request (request.id)}
			<article
				class="flex flex-col gap-3 rounded-inset bg-surface-muted p-4"
				data-testid="shop-request"
			>
				<div class="flex flex-wrap items-center gap-2">
					<a
						class="font-heading text-xl text-link hover:text-link-hover"
						href={resolve(`/crm/requests/${request.id}`)}>{request.number}</a
					>
					{#if request.priority === 'urgent'}
						<span class={['rounded-pill px-3 py-0.5 text-xs', TONE_CLASS.warning]}>
							{PRIORITY_TITLE.urgent}
						</span>
					{/if}
					<span class="text-sm text-fg-muted">
						{request.isStockRequest ? STOCK_TITLE : (request.counterpartyName ?? '')}
						{#if request.deliveryAt}· срок {formatDayMonth(request.deliveryAt, timeZone)}{/if}
					</span>
					<span class="ml-auto text-sm" data-testid="shop-fill">
						Наполнено {request.filledCount} из {request.unitCount}
					</span>
				</div>
				<ul class="flex flex-col gap-1 text-sm">
					{#each request.lines as line (line.itemId)}
						<li class="flex flex-wrap gap-2">
							<span class="flex-1">{positionTitle(line)} · {colourTitle(line)}</span>
							<span class={line.filledQty >= line.qty ? 'text-fg' : 'text-danger'}>
								{line.filledQty} из {line.qty}
							</span>
						</li>
					{/each}
				</ul>
				{#if request.canAssemble}
					<form
						method="POST"
						action="?/assemble"
						use:enhance={withToast({ success: 'Заявка собрана' })}
					>
						<input type="hidden" name="requestId" value={request.id} />
						<TouchButton type="submit" variant="primary">Заявка собрана</TouchButton>
					</form>
				{/if}
			</article>
		{:else}
			<EmptyState title="Заявок в работе не найдено" />
		{/each}
		{#if total > requests.length}
			<p class="text-sm text-fg-muted">
				Показаны {requests.length} из {total}. Найдите остальные по номеру.
			</p>
		{/if}
	</Card.Content>
</Card.Root>
