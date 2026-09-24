<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import AuditTable from '$lib/crm/audit/AuditTable.svelte';
	import { AUDIT_ACTION_TITLE, AUDIT_ENTITY_TITLE } from '$lib/crm/labels';
	import { Card, FilterBar, type FilterField } from '$lib/ui';
	import type { ListQuery } from '$lib/types/list';
	import { filtersOf, listQueryOf, withListQuery } from '$lib/utils/list-url';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const FILTER_KEYS = ['actor', 'action', 'entity', 'from', 'to'] as const;

	// Options come from what the journal holds, so a filter never offers an empty choice.
	const fields = $derived<FilterField[]>([
		{ key: 'actor', label: 'Кто', type: 'text', placeholder: 'Введите имя' },
		{
			key: 'action',
			label: 'Действие',
			type: 'select',
			placeholder: 'Выберите действие',
			options: [
				{ value: '', label: 'Все действия' },
				...data.journal.actions.map((value) => ({
					value,
					label: AUDIT_ACTION_TITLE[value] ?? value
				}))
			]
		},
		{
			key: 'entity',
			label: 'Объект',
			type: 'select',
			placeholder: 'Выберите объект',
			options: [
				{ value: '', label: 'Все объекты' },
				...data.journal.entities.map((value) => ({
					value,
					label: AUDIT_ENTITY_TITLE[value] ?? value
				}))
			]
		},
		{ key: 'from', label: 'С', type: 'date', placeholder: 'Выберите дату' },
		{ key: 'to', label: 'По', type: 'date', placeholder: 'Выберите дату' }
	]);

	let filters = $state(filtersOf(page.url, FILTER_KEYS));

	const query = $derived(listQueryOf(page.url, data.journal));

	function changeQuery(next: ListQuery): void {
		// Same page with a rewritten query string, so there is no route pattern to resolve.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(withListQuery(page.url, next), { keepFocus: true, noScroll: true });
	}
</script>

<svelte:head><title>Журнал аудита</title></svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
	<div>
		<h1 class="mb-2 text-3xl">Журнал аудита</h1>
		<p class="max-w-2xl text-fg-muted">
			Кто и когда менял данные: пользователи, справочники, настройки, заявки. Новые записи сверху.
		</p>
	</div>

	<Card.Root>
		<Card.Content class="flex flex-col gap-4">
			<FilterBar {fields} bind:filters />
			<AuditTable
				rows={data.journal.rows}
				total={data.journal.total}
				{query}
				onQueryChange={changeQuery}
				timeZone={data.timezone}
			/>
		</Card.Content>
	</Card.Root>
</div>
