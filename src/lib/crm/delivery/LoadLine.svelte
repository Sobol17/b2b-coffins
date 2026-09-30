<script lang="ts">
	import { enhance } from '$app/forms';
	import { colourTitle, positionTitle } from '$lib/crm/shop/labels';
	import { Button, NumberInput, TouchButton, withToast } from '$lib/ui';
	import type { DeliveryLineDto } from '$lib/types/crm-delivery';

	let { line }: { line: DeliveryLineDto } = $props();

	const lacking = $derived(line.qty - line.loadedQty);
</script>

<li class="flex flex-col gap-2 border-t border-border pt-3" data-testid="delivery-line">
	<div class="flex flex-wrap gap-2 text-sm">
		<span class="flex-1">{positionTitle(line)} · {colourTitle(line)}</span>
		<span class={lacking > 0 ? 'text-danger' : 'text-fg'} data-testid="delivery-loaded">
			Погружено {line.loadedQty} из {line.qty}
		</span>
	</div>
	<div class="flex flex-wrap items-end gap-3">
		{#if line.loadableQty > 0}
			<form
				method="POST"
				action="?/load"
				class="flex flex-wrap items-end gap-3"
				use:enhance={withToast({ success: 'Погрузка отмечена' })}
			>
				<input type="hidden" name="itemId" value={line.itemId} />
				<div class="w-28">
					<NumberInput
						label="Штук"
						name="qty"
						value={line.loadableQty}
						min={1}
						max={line.loadableQty}
						placeholder="Введите число"
					/>
				</div>
				<TouchButton type="submit" variant="primary">Погрузил</TouchButton>
			</form>
		{:else if lacking > 0}
			<p class="text-sm text-danger">На складе не хватает позиций для погрузки.</p>
		{/if}
		{#if line.loadedQty > 0}
			<form method="POST" action="?/unload" use:enhance={withToast({ success: 'Погрузка снята' })}>
				<input type="hidden" name="itemId" value={line.itemId} />
				<Button type="submit" variant="ghost" size="lg">Снять</Button>
			</form>
		{/if}
	</div>
</li>
