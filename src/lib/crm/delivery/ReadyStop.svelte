<script lang="ts">
	import { enhance } from '$app/forms';
	import LoadLine from './LoadLine.svelte';
	import StopHeader from './StopHeader.svelte';
	import { Checkbox, TouchButton, withToast } from '$lib/ui';
	import type { DeliveryStopDto } from '$lib/types/crm-delivery';
	import { formatMinor } from '$lib/utils/format';

	let { stop, timeZone }: { stop: DeliveryStopDto; timeZone: string } = $props();
</script>

<article class="flex flex-col gap-3 rounded-inset bg-surface-muted p-4" data-testid="delivery-stop">
	<StopHeader {stop} {timeZone} />
	<ul class="flex flex-col gap-3">
		{#each stop.lines as line (line.itemId)}
			<LoadLine {line} />
		{/each}
	</ul>
	{#if stop.totalMinor !== undefined}
		<p class="text-sm" data-testid="delivery-sum">
			Сумма заявки {formatMinor(stop.totalMinor)}
			{#if stop.dueMinor !== undefined && stop.dueMinor !== stop.totalMinor}
				· к получению {formatMinor(stop.dueMinor)}
			{/if}
		</p>
	{/if}
	{#if stop.canDeliver}
		<form
			method="POST"
			action="?/deliver"
			class="flex flex-wrap items-center gap-4"
			use:enhance={withToast({ success: 'Заявка доставлена' })}
		>
			<input type="hidden" name="requestId" value={stop.id} />
			{#if (stop.dueMinor ?? 0) > 0}
				<Checkbox name="cashCollected" value="on" label="Принял оплату наличными" />
			{/if}
			<TouchButton type="submit" variant="primary">Доставлено</TouchButton>
		</form>
	{:else}
		<p class="text-sm text-fg-muted">
			Погружено {stop.loadedCount} из {stop.unitCount}. «Доставлено» появится, когда погрузите всё.
		</p>
	{/if}
</article>
