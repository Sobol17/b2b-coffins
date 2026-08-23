<script lang="ts">
	import { Pagination as PaginationPrimitive } from 'bits-ui';
	import { buttonVariants, type ButtonSize } from '$lib/ui/base/button/index.js';
	import { cn } from '$lib/utils/cn.js';
	let {
		ref = $bindable(null),
		class: className,
		size = 'md',
		isActive,
		page,
		children,
		...restProps
	}: PaginationPrimitive.PageProps & {
		size?: ButtonSize;
		isActive: boolean;
	} = $props();
</script>

{#snippet Fallback()}
	{page.value}
{/snippet}

<PaginationPrimitive.Page
	bind:ref
	{page}
	aria-current={isActive ? 'page' : undefined}
	data-slot="pagination-link"
	data-active={isActive}
	data-size={size}
	class={cn(
		buttonVariants({ size, variant: isActive ? 'secondary' : 'ghost' }),
		'cn-pagination-link w-9 px-0',
		className
	)}
	{...restProps}
>
	<!--
	The primitive hardcodes an English aria-label and wins the merge, so the button is rendered
	here: the interface is Russian and a screen reader must not read "Page 2".
	-->
	{#snippet child({ props })}
		<button {...props} type="button" aria-label="Страница {page.value}">
			{#if children}
				{@render children()}
			{:else}
				{@render Fallback()}
			{/if}
		</button>
	{/snippet}
</PaginationPrimitive.Page>
