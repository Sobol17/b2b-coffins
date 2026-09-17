<script lang="ts">
	import { Command as CommandPrimitive } from 'bits-ui';
	import * as InputGroup from '$lib/ui/base/input-group/index.js';
	import SearchIcon from '@lucide/svelte/icons/search';
	import { cn } from '$lib/utils/cn.js';

	let {
		ref = $bindable(null),
		class: className,
		value = $bindable(''),
		...restProps
	}: CommandPrimitive.InputProps = $props();
</script>

<div data-slot="command-input-wrapper" class="p-2 pb-1">
	<InputGroup.Root
		class="h-10! rounded-pill! border-transparent bg-surface-muted shadow-none! has-[[data-slot=input-group-control]:focus-visible]:bg-surface-raised *:data-[slot=input-group-addon]:pl-3!"
	>
		<CommandPrimitive.Input
			{value}
			data-slot="command-input"
			class={cn(
				// The kit Input brings its own pill height and fills; inside the group they fight the group's own.
				'h-full w-full text-sm outline-hidden hover:bg-transparent focus-visible:bg-transparent disabled:cursor-not-allowed disabled:opacity-50',
				className
			)}
			{...restProps}
		>
			{#snippet child({ props })}
				<InputGroup.Input {...props} bind:value bind:ref />
			{/snippet}
		</CommandPrimitive.Input>
		<InputGroup.Addon>
			<SearchIcon class="size-4 shrink-0 opacity-50" />
		</InputGroup.Addon>
	</InputGroup.Root>
</div>
