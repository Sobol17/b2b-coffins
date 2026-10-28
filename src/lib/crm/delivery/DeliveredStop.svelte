<script lang="ts">
	import { StatusBadge } from '$lib/ui';
	import type { DeliveredStopDto } from '$lib/types/crm-delivery';
	import { formatDateTime } from '$lib/utils/format';

	let { stop, timeZone }: { stop: DeliveredStopDto; timeZone: string } = $props();
</script>

<article class="flex flex-col gap-2 rounded-inset bg-surface-muted p-4" data-testid="delivery-done">
	<div class="flex flex-wrap items-center gap-2">
		<span class="font-heading text-xl" data-testid="delivery-number">{stop.number}</span>
		<StatusBadge status={stop.status} />
		<span class="text-sm text-fg-muted">{stop.counterpartyName}</span>
		<span class="ml-auto text-sm">доставлено {formatDateTime(stop.deliveredAt, timeZone)}</span>
	</div>
	{#if stop.deceasedName}
		<p class="text-sm">Умерший: {stop.deceasedName}</p>
	{/if}
	<div class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
		<span>{stop.address ?? 'Адрес не указан'}</span>
		<span>{stop.unitCount} шт.</span>
	</div>
</article>
