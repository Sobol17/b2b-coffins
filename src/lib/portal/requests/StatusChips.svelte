<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button, REQUEST_STATUS_META } from '$lib/ui';
	import { ACTIVE_STATUSES, CLOSED_STATUSES } from '$lib/domain/request/registry';
	import type { RequestStatus } from '$lib/types/request';

	/*
	 * Chips of the mockup: every status the registry can hold with the number of requests in it.
	 * Picking a chip writes the status into the url, so a filtered view can be shared and reloaded.
	 */
	let {
		counts,
		selected
	}: {
		counts: Readonly<Record<RequestStatus, number>>;
		selected: readonly RequestStatus[];
	} = $props();

	const statuses: readonly RequestStatus[] = [...ACTIVE_STATUSES, ...CLOSED_STATUSES];
	const totalCount = $derived(statuses.reduce((sum, status) => sum + counts[status], 0));

	function show(status: RequestStatus | null): void {
		const url = new URL(page.url);
		url.searchParams.delete('status');
		url.searchParams.delete('page');
		if (status !== null) url.searchParams.set('status', status);
		// Same page with a rewritten query string, so there is no route pattern to resolve.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(url, { keepFocus: true, noScroll: true });
	}
</script>

<div data-testid="status-chips" class="flex flex-wrap gap-2">
	<Button
		size="sm"
		variant={selected.length === 0 ? 'primary' : 'ghost'}
		onclick={() => show(null)}
	>
		Все {totalCount}
	</Button>
	{#each statuses as status (status)}
		{#if counts[status] > 0 || selected.includes(status)}
			<Button
				size="sm"
				data-testid="status-chip"
				variant={selected.includes(status) ? 'primary' : 'ghost'}
				onclick={() => show(status)}
			>
				{REQUEST_STATUS_META[status].label}
				{counts[status]}
			</Button>
		{/if}
	{/each}
</div>
