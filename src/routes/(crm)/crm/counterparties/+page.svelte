<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import CounterpartiesTable from '$lib/crm/counterparties/CounterpartiesTable.svelte';
	import { SCHEME_OPTIONS } from '$lib/crm/labels';
	import { Card, FilterBar, buttonVariants, type FilterField } from '$lib/ui';
	import type { ListQuery } from '$lib/types/list';
	import { filtersOf, listQueryOf, withListQuery } from '$lib/utils/list-url';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const fields = $derived<FilterField[]>([
		{ key: 'search', label: 'Поиск', type: 'text', placeholder: 'Название или ИНН' },
		{
			key: 'managerId',
			label: 'Менеджер',
			type: 'select',
			placeholder: 'Выберите менеджера',
			options: [
				{ value: '', label: 'Все менеджеры' },
				...data.choices.managers.map((row) => ({ value: String(row.id), label: row.fullName }))
			]
		},
		{
			key: 'scheme',
			label: 'Расчёты',
			type: 'select',
			placeholder: 'Выберите схему',
			options: [{ value: '', label: 'Все схемы' }, ...SCHEME_OPTIONS]
		},
		{
			key: 'hasDebt',
			label: 'Задолженность',
			type: 'select',
			placeholder: 'Выберите вариант',
			options: [
				{ value: '', label: 'Все' },
				{ value: 'true', label: 'Только с долгом' }
			]
		}
	]);

	let filters = $state(filtersOf(page.url, ['search', 'managerId', 'scheme', 'hasDebt']));
	const query = $derived(listQueryOf(page.url, data.counterparties));

	function changeQuery(next: ListQuery): void {
		// Same page with a rewritten query string, so there is no route pattern to resolve.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(withListQuery(page.url, next), { keepFocus: true, noScroll: true });
	}
</script>

<svelte:head><title>Контрагенты</title></svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
	<div class="flex flex-wrap items-end gap-4">
		<div>
			<h1 class="mb-2 text-3xl">Контрагенты</h1>
			<p class="max-w-2xl text-fg-muted">
				Агентства, их условия, доступ к порталу и задолженность по отметкам оплаты.
			</p>
		</div>
		<a
			class={['sm:ml-auto', buttonVariants({ variant: 'primary' })]}
			href={resolve('/crm/counterparties/new')}
		>
			Завести контрагента
		</a>
	</div>

	<Card.Root>
		<Card.Content class="flex flex-col gap-4">
			<FilterBar {fields} bind:filters />
			<CounterpartiesTable
				rows={data.counterparties.rows}
				total={data.counterparties.total}
				{query}
				onQueryChange={changeQuery}
			/>
		</Card.Content>
	</Card.Root>
</div>
