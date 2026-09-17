<script lang="ts">
	import SearchIcon from '@lucide/svelte/icons/search';
	import { Button } from '$lib/ui';
	import { LazyComponent } from '$lib/ui/lazy.svelte';
	import type { ProfileNavRights } from '../profile-nav';

	let { rights }: { rights: ProfileNavRights } = $props();

	let open = $state(false);
	let shortcut = $state('Ctrl K');

	// The palette ships with the command primitive, the heaviest part of the kit: loaded on first open.
	const panel = new LazyComponent(() => import('./HeaderSearchPanel.svelte'));

	$effect(() => {
		if (open) panel.request();
	});

	$effect(() => {
		if (/Mac|iPhone|iPad/.test(navigator.userAgent)) shortcut = '⌘K';
	});

	function onKeydown(event: KeyboardEvent): void {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			open = !open;
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<Button
	variant="secondary"
	size="sm"
	data-testid="search-button"
	aria-label="Поиск по порталу"
	aria-keyshortcuts="Control+K Meta+K"
	aria-haspopup="dialog"
	class="w-9.5 gap-2 px-0 lg:w-52 lg:justify-start lg:px-4 lg:font-normal lg:text-fg-faint"
	onclick={() => (open = true)}
>
	<SearchIcon />
	<span class="hidden lg:inline">Поиск</span>
	<kbd class="ml-auto hidden font-sans text-xs text-fg-faint lg:inline">{shortcut}</kbd>
</Button>

{#if panel.component}
	{@const Panel = panel.component}
	<Panel bind:open {rights} />
{/if}
