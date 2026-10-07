<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import DeliveryTable from '$lib/crm/notifications/DeliveryTable.svelte';
	import { DELIVERY_LABEL, EVENT_LABEL } from '$lib/notifications/labels';
	import { Card, FilterBar, type FilterField } from '$lib/ui';
	import { EVENT_KEYS } from '$lib/types/events';
	import type { ListQuery } from '$lib/types/list';
	import { NOTIFICATION_STATUSES } from '$lib/types/notifications';
	import { filtersOf, listQueryOf, withListQuery } from '$lib/utils/list-url';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const FILTER_KEYS = ['eventKey', 'status'] as const;

	const fields: FilterField[] = [
		{
			key: 'eventKey',
			label: 'Событие',
			type: 'select',
			placeholder: 'Выберите событие',
			options: [
				{ value: '', label: 'Все события' },
				...EVENT_KEYS.map((value) => ({ value, label: EVENT_LABEL[value].title }))
			]
		},
		{
			key: 'status',
			label: 'Доставка',
			type: 'select',
			placeholder: 'Выберите статус',
			options: [
				{ value: '', label: 'Любая' },
				...NOTIFICATION_STATUSES.map((value) => ({ value, label: DELIVERY_LABEL[value] }))
			]
		}
	];

	let filters = $state(filtersOf(page.url, FILTER_KEYS));

	const query = $derived(listQueryOf(page.url, data.log));

	function changeQuery(next: ListQuery): void {
		// Same page with a rewritten query string, so there is no route pattern to resolve.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(withListQuery(page.url, next), { keepFocus: true, noScroll: true });
	}
</script>

<svelte:head><title>Журнал отправок</title></svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
	<div>
		<h1 class="mb-2 text-3xl">Журнал отправок</h1>
		<p class="max-w-3xl text-fg-muted">
			Пуши, которые система отправила людям мастерской и контрагентов. Человек без подписанного
			устройства в журнал не попадает.
		</p>
	</div>

	<Card.Root data-testid="delivery-log">
		<Card.Content class="flex flex-col gap-4">
			<FilterBar {fields} bind:filters />
			<DeliveryTable
				rows={data.log.rows}
				total={data.log.total}
				{query}
				onQueryChange={changeQuery}
				timeZone={data.timezone}
			/>
		</Card.Content>
	</Card.Root>
</div>
