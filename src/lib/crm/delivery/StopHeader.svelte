<script lang="ts">
	import { PRIORITY_TITLE } from '$lib/crm/requests/labels';
	import { TONE_CLASS } from '$lib/ui';
	import type { DeliveryStopDto } from '$lib/types/crm-delivery';
	import { formatDateTime } from '$lib/utils/format';

	let { stop, timeZone }: { stop: DeliveryStopDto; timeZone: string } = $props();

	// A dialer takes digits and the plus only: spaces and dashes of a typed number would break it.
	const dial = $derived(stop.contactPhone?.replace(/[^\d+]/g, '') ?? '');
</script>

<div class="flex flex-col gap-2">
	<div class="flex flex-wrap items-center gap-2">
		<span class="font-heading text-xl" data-testid="delivery-number">{stop.number}</span>
		{#if stop.priority === 'urgent'}
			<span class={['rounded-pill px-3 py-0.5 text-xs', TONE_CLASS.warning]}>
				{PRIORITY_TITLE.urgent}
			</span>
		{/if}
		<span class="text-sm text-fg-muted">{stop.counterpartyName}</span>
		{#if stop.deliveryAt}
			<span class="ml-auto text-sm">срок {formatDateTime(stop.deliveryAt, timeZone)}</span>
		{/if}
	</div>
	{#if stop.deceasedName}
		<p class="text-sm">Умерший: {stop.deceasedName}</p>
	{/if}
	<div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
		<span>{stop.address ?? 'Адрес не указан'}</span>
		{#if stop.navigationUrl}
			<!-- The route opens Yandex Maps, not an app page resolve() could check. -->
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<a
				class="text-link hover:text-link-hover"
				href={stop.navigationUrl}
				target="_blank"
				rel="noopener noreferrer"
				data-testid="delivery-route">Маршрут</a
			>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{/if}
		{#if stop.contactName || stop.contactPhone}
			<span>
				{stop.contactName ?? ''}
				{#if dial}
					<a class="text-link hover:text-link-hover" href={`tel:${dial}`}>{stop.contactPhone}</a>
				{/if}
			</span>
		{/if}
	</div>
</div>
