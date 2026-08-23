<script lang="ts">
	import * as Dialog from '$lib/ui/base/dialog/index.js';
	import type { Snippet } from 'svelte';

	let {
		open = $bindable(false),
		title,
		description,
		onClose,
		body,
		footer
	}: {
		open?: boolean;
		title: string;
		description?: string | undefined;
		onClose?: (() => void) | undefined;
		body: Snippet;
		footer?: Snippet | undefined;
	} = $props();
</script>

<Dialog.Root
	bind:open
	onOpenChange={(next) => {
		if (!next) onClose?.();
	}}
>
	<Dialog.Content data-testid="modal">
		<Dialog.Header>
			<Dialog.Title>{title}</Dialog.Title>
			{#if description}
				<Dialog.Description>{description}</Dialog.Description>
			{/if}
		</Dialog.Header>
		{@render body()}
		{#if footer}
			<Dialog.Footer>{@render footer()}</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
