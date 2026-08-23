<script lang="ts">
	import * as Empty from '$lib/ui/base/empty/index.js';
	import type { Snippet } from 'svelte';

	/*
	 * The only failure screen in the app. Without a network the request simply fails and this is
	 * what the user sees: there is no offline mode to fall back to (tech.md 17).
	 */
	let {
		title = 'Не удалось загрузить данные',
		description,
		action
	}: { title?: string; description?: string; action?: Snippet } = $props();
</script>

<Empty.Root data-slot="error-state" role="alert">
	<Empty.Header>
		<Empty.Title class="text-danger">{title}</Empty.Title>
		{#if description}
			<Empty.Description>{description}</Empty.Description>
		{/if}
	</Empty.Header>
	{#if action}
		<Empty.Content>{@render action()}</Empty.Content>
	{/if}
</Empty.Root>
