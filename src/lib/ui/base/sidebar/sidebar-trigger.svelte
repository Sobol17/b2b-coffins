<script lang="ts">
	import PanelLeftIcon from '@lucide/svelte/icons/panel-left';
	import { cn } from '$lib/utils/cn.js';
	import { useSidebar } from './context.svelte.js';

	// The generated trigger spread the whole Button surface; the shell only ever needs a class.
	let { class: className }: { class?: string | undefined } = $props();

	const sidebar = useSidebar();
</script>

<button
	type="button"
	data-sidebar="trigger"
	data-slot="sidebar-trigger"
	aria-label="Меню разделов"
	class={cn(
		'inline-flex size-touch shrink-0 items-center justify-center rounded-pill text-fg-muted transition-colors outline-none hover:bg-surface-muted hover:text-fg focus-visible:ring-3 focus-visible:ring-ring/50',
		className
	)}
	onclick={() => sidebar.toggle()}
>
	<PanelLeftIcon class="size-5" aria-hidden="true" />
</button>
