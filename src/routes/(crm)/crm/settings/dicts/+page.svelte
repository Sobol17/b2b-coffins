<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import DictItemModal from '$lib/crm/dicts/DictItemModal.svelte';
	import DictTable from '$lib/crm/dicts/DictTable.svelte';
	import { DICT_TITLE } from '$lib/crm/labels';
	import { Button, Card, ErrorState, FilterBar, type FilterField } from '$lib/ui';
	import type { DictItemDto } from '$lib/types/crm';
	import { DICT_CODES } from '$lib/types/dicts';
	import type { ListQuery } from '$lib/types/list';
	import { filtersOf, listQueryOf, withListQuery } from '$lib/utils/list-url';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const fields: FilterField[] = [
		{
			key: 'dict',
			label: 'Справочник',
			type: 'select',
			placeholder: 'Выберите справочник',
			options: DICT_CODES.map((code) => ({ value: code, label: DICT_TITLE[code] }))
		},
		{ key: 'search', label: 'Поиск', type: 'text', placeholder: 'Введите название или код' }
	];

	// Without `dict` in the url the server opens the first dictionary; the select names it too.
	let filters = $state({ dict: DICT_CODES[0], ...filtersOf(page.url, ['dict', 'search']) });
	// null: closed; 'new': a new item; an item: its edit.
	let editing = $state<DictItemDto | 'new' | null>(null);

	const query = $derived(listQueryOf(page.url, data.items));

	function changeQuery(next: ListQuery): void {
		// Same page with a rewritten query string, so there is no route pattern to resolve.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(withListQuery(page.url, next), { keepFocus: true, noScroll: true });
	}

	const errors = $derived(form && 'errors' in form ? form.errors : undefined);
	const failure = $derived(form && 'formError' in form ? form : undefined);
	const inModal = $derived(failure?.action === 'create' || failure?.action === 'update');
</script>

<svelte:head><title>Справочники</title></svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
	<div class="flex flex-wrap items-end gap-4">
		<div>
			<h1 class="mb-2 text-3xl">Справочники</h1>
			<p class="max-w-2xl text-fg-muted">
				Материалы, единицы, виды работ и причины. Запись, которая больше не нужна, выключается:
				заявки и склад продолжают на неё ссылаться.
			</p>
		</div>
		<Button class="sm:ml-auto" onclick={() => (editing = 'new')}>Добавить запись</Button>
	</div>

	{#if failure && !inModal}
		<div data-testid="dicts-error">
			<ErrorState title={failure.formError ?? 'Действие не выполнено'} />
		</div>
	{/if}

	<Card.Root>
		<Card.Content class="flex flex-col gap-4">
			<FilterBar {fields} bind:filters />
			<h2 class="text-2xl" data-testid="dict-title">{DICT_TITLE[data.dict]}</h2>
			<DictTable
				rows={data.items.rows}
				total={data.items.total}
				{query}
				onQueryChange={changeQuery}
				onEdit={(item) => (editing = item)}
			/>
		</Card.Content>
	</Card.Root>
</div>

<DictItemModal
	open={editing !== null}
	dict={data.dict}
	item={editing === 'new' ? null : editing}
	{errors}
	formError={inModal ? failure?.formError : undefined}
	onClose={() => (editing = null)}
/>
