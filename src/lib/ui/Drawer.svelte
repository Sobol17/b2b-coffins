<script lang="ts">
	import * as Sheet from '$lib/ui/base/sheet/index.js';
	import type { Snippet } from 'svelte';

	// A side panel on the same dialog primitive as Modal: one overlay behaviour, one focus trap.
	let {
		open = $bindable(false),
		title,
		description,
		side = 'right',
		onClose,
		body,
		footer
	}: {
		open?: boolean;
		title: string;
		description?: string | undefined;
		side?: 'top' | 'right' | 'bottom' | 'left';
		onClose?: (() => void) | undefined;
		body: Snippet;
		footer?: Snippet | undefined;
	} = $props();
</script>

<Sheet.Root
	bind:open
	onOpenChange={(next) => {
		if (!next) onClose?.();
	}}
>
	<Sheet.Content {side} data-testid="drawer">
		<Sheet.Header>
			<Sheet.Title>{title}</Sheet.Title>
			{#if description}
				<Sheet.Description>{description}</Sheet.Description>
			{/if}
		</Sheet.Header>
		<div class="px-4">{@render body()}</div>
		{#if footer}
			<Sheet.Footer>{@render footer()}</Sheet.Footer>
		{/if}
	</Sheet.Content>
</Sheet.Root>
