<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import SupportThreadList from '$lib/support/SupportThreadList.svelte';
	import { Card, FilterBar, type FilterField } from '$lib/ui';
	import type { ListQuery } from '$lib/types/list';
	import { filtersOf, listQueryOf, withListQuery } from '$lib/utils/list-url';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const fields = $derived<FilterField[]>([
		{
			key: 'search',
			label: 'Поиск',
			type: 'text',
			placeholder: 'Введите тему, номер заявки или контрагента'
		},
		{
			key: 'awaiting',
			label: 'Ожидание',
			type: 'select',
			placeholder: 'Выберите вариант',
			options: [
				{ value: '', label: 'Все' },
				{ value: 'crm', label: 'Ждут ответа' },
				{ value: 'portal', label: 'Ответили' }
			]
		},
		{
			key: 'status',
			label: 'Статус',
			type: 'select',
			placeholder: 'Выберите статус',
			options: [
				{ value: '', label: 'Все' },
				{ value: 'open', label: 'Открытые' },
				{ value: 'closed', label: 'Закрытые' }
			]
		},
		{
			key: 'counterpartyId',
			label: 'Контрагент',
			type: 'select',
			placeholder: 'Выберите контрагента',
			options: [
				{ value: '', label: 'Все контрагенты' },
				...data.counterparties.map((row) => ({ value: String(row.id), label: row.name }))
			]
		}
	]);

	let filters = $state(filtersOf(page.url, ['search', 'awaiting', 'status', 'counterpartyId']));
	const query = $derived(listQueryOf(page.url, data.threads));

	function changeQuery(next: ListQuery): void {
		// Same page with a rewritten query string, so there is no route pattern to resolve.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(withListQuery(page.url, next), { keepFocus: true, noScroll: true });
	}
</script>

<svelte:head><title>Обращения</title></svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
	<div>
		<h1 data-testid="support-title" class="mb-2 text-3xl">Обращения</h1>
		<p class="max-w-2xl text-fg-muted">
			Вопросы контрагентов. Первыми идут те, что ждут ответа мастерской.
		</p>
	</div>

	<Card.Root>
		<Card.Content class="flex flex-col gap-4">
			<FilterBar {fields} bind:filters />
			<SupportThreadList
				threads={data.threads}
				{query}
				onQueryChange={changeQuery}
				contour="crm"
				showAuthor={true}
				timeZone={data.timezone}
				hrefOf={(id) => resolve(`/crm/support/${id}`)}
			/>
		</Card.Content>
	</Card.Root>
</div>
