<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils/cn.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLUListElement>> = $props();
</script>

<!-- Wraps instead of pushing the page sideways when a phone cannot fit every page number. -->
<ul
	bind:this={ref}
	data-slot="pagination-content"
	class={cn('flex flex-wrap items-center justify-center gap-0.5', className)}
	{...restProps}
>
	{@render children?.()}
</ul>
