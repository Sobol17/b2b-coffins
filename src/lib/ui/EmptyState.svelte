<script lang="ts">
	import * as Empty from '$lib/ui/base/empty/index.js';
	import type { Snippet } from 'svelte';

	let { title, description, action }: { title: string; description?: string; action?: Snippet } =
		$props();
</script>

<Empty.Root data-slot="empty-state">
	<Empty.Header>
		<Empty.Title>{title}</Empty.Title>
		{#if description}
			<Empty.Description>{description}</Empty.Description>
		{/if}
	</Empty.Header>
	{#if action}
		<Empty.Content>{@render action()}</Empty.Content>
	{/if}
</Empty.Root>
