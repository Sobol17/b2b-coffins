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
	{#if children}
		{@render children?.()}
	{:else}
		{@render Fallback()}
	{/if}
</PaginationPrimitive.Page>
