<script lang="ts">
	import StopHeader from './StopHeader.svelte';
	import { colourTitle, positionTitle } from '$lib/crm/shop/labels';
	import type { DeliveryStopDto } from '$lib/types/crm-delivery';

	let { stop, timeZone }: { stop: DeliveryStopDto; timeZone: string } = $props();
</script>

<article class="flex flex-col gap-3 rounded-inset bg-surface-muted p-4" data-testid="delivery-plan">
	<StopHeader {stop} {timeZone} />
	<ul class="flex flex-col gap-1 text-sm">
		{#each stop.lines as line (line.itemId)}
			<li class="flex flex-wrap gap-2">
				<span class="flex-1">{positionTitle(line)} · {colourTitle(line)}</span>
				<span>{line.qty} шт.</span>
			</li>
		{/each}
	</ul>
</article>
