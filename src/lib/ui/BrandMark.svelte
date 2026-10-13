<script lang="ts">
	import { asset } from '$app/paths';
	import { cn } from '$lib/utils/cn';

	/*
	 * The mark of the workshop next to its wordmark (tech.md 17.1). It stands beside the name, so
	 * by default a screen reader skips it; a place without the name passes `alt`.
	 */
	let { alt = '', class: className }: { alt?: string; class?: string } = $props();
</script>

<img
	src={asset('/brand/mark.png')}
	{alt}
	width="144"
	height="144"
	data-testid="brand-mark"
	class={cn('size-10 shrink-0 rounded-inset', className)}
/>
