<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import RequestsTable from '$lib/crm/requests/RequestsTable.svelte';
	import { REQUEST_FILTER_KEYS, requestFilterFields } from '$lib/crm/requests/filters';
	import { Card, FilterBar, buttonVariants } from '$lib/ui';
	import type { ListQuery } from '$lib/types/list';
	import { filtersOf, listQueryOf, withListQuery } from '$lib/utils/list-url';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const fields = $derived(requestFilterFields(data.counterparties, true));
	let filters = $state(filtersOf(page.url, REQUEST_FILTER_KEYS));
	const query = $derived(listQueryOf(page.url, data.requests));
	// The sheet repeats what the table shows: same filters, search and sorting.
	const exportUrl = $derived(`${resolve('/crm/requests/export.xlsx')}${page.url.search}`);

	function changeQuery(next: ListQuery): void {
		// Same page with a rewritten query string, so there is no route pattern to resolve.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(withListQuery(page.url, next), { keepFocus: true, noScroll: true });
	}
</script>

<svelte:head><title>Заявки</title></svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
	<div class="flex flex-wrap items-end gap-4">
		<div>
			<h1 class="mb-2 text-3xl">Заявки</h1>
			<p class="max-w-2xl text-fg-muted">
				Все заявки мастерской: от контрагентов, принятые по телефону и на склад.
			</p>
		</div>
		<div class="flex flex-wrap gap-2 sm:ml-auto">
			<a class={buttonVariants({ variant: 'secondary' })} href={resolve('/crm/board')}>Доска</a>
			<a class={buttonVariants({ variant: 'primary' })} href={resolve('/crm/requests/new')}>
				Новая заявка
			</a>
		</div>
	</div>

	<Card.Root>
		<Card.Content class="flex flex-col gap-4">
			<FilterBar {fields} bind:filters />
			<RequestsTable
				rows={data.requests.rows}
				total={data.requests.total}
				{query}
				onQueryChange={changeQuery}
				{exportUrl}
				timeZone={data.timezone}
				withMoney={data.user.canSeePrices}
			/>
		</Card.Content>
	</Card.Root>
</div>
