<script lang="ts">
	import { Card } from '$lib/ui';

	/* One figure of a report with the way to the report behind it. */
	let {
		label,
		value,
		hint,
		href,
		testid
	}: {
		label: string;
		value: string;
		hint?: string;
		/** Already resolved by the caller; may carry the period of the dashboard. */
		href?: string;
		testid: string;
	} = $props();
</script>

<Card.Root>
	<Card.Content class="flex flex-col gap-1">
		<p class="text-sm text-fg-muted">{label}</p>
		<p class="text-2xl font-medium tabular-nums" data-testid={testid}>{value}</p>
		{#if hint}<p class="text-sm text-fg-muted">{hint}</p>{/if}
		{#if href}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the caller resolves the route and adds the period -->
			<a class="text-sm text-link underline hover:text-link-hover" {href}>Открыть отчёт</a>
		{/if}
	</Card.Content>
</Card.Root>
