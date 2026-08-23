<script lang="ts">
	import type { Snippet } from 'svelte';

	// One frame per primitive. The e2e suite walks these by data-primitive to prove the kit renders.
	let { name, children }: { name: string; children: Snippet } = $props();
</script>

<section data-primitive={name} class="flex flex-col gap-3 rounded-card border border-border p-4">
	<h2 class="text-sm font-medium text-fg-muted">{name}</h2>
	<div class="flex flex-wrap items-start gap-4">{@render children()}</div>
</section>
