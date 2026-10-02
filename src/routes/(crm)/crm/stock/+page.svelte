<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import StockItemModal from '$lib/crm/stock/StockItemModal.svelte';
	import StockTable from '$lib/crm/stock/StockTable.svelte';
	import { KIND_OPTIONS } from '$lib/crm/stock/labels';
	import { Button, Card, FilterBar, buttonVariants, type FilterField } from '$lib/ui';
	import type { ListQuery } from '$lib/types/list';
	import { filtersOf, listQueryOf, withListQuery } from '$lib/utils/list-url';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const flag = (label: string) => [
		{ value: '', label: 'Все' },
		{ value: 'true', label }
	];
	const fields: FilterField[] = [
		{ key: 'search', label: 'Поиск', type: 'text', placeholder: 'Введите код или название' },
		{
			key: 'kind',
			label: 'Вид',
			type: 'select',
			placeholder: 'Выберите вид',
			options: [{ value: '', label: 'Все виды' }, ...KIND_OPTIONS]
		},
		{
			key: 'belowThreshold',
			label: 'Порог',
			type: 'select',
			placeholder: 'Выберите вариант',
			options: flag('Только ниже порога')
		},
		{
			key: 'negative',
			label: 'Минус',
			type: 'select',
			placeholder: 'Выберите вариант',
			options: flag('Только в минусе')
		}
	];

	let filters = $state(filtersOf(page.url, ['search', 'kind', 'belowThreshold', 'negative']));
	const query = $derived(listQueryOf(page.url, data.items));
	// The sheet repeats what the table shows: same filters, search and sorting.
	const exportUrl = $derived(`${resolve('/crm/stock/export.xlsx')}${page.url.search}`);
	let createOpen = $state(false);

	function changeQuery(next: ListQuery): void {
		// Same page with a rewritten query string, so there is no route pattern to resolve.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(withListQuery(page.url, next), { keepFocus: true, noScroll: true });
	}
</script>

<svelte:head><title>Склад</title></svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
	<div class="flex flex-wrap items-end gap-4">
		<div>
			<h1 class="mb-2 text-3xl">Склад</h1>
			<p class="max-w-2xl text-fg-muted">
				Остаток позиции равен сумме её движений. Откройте позицию, чтобы увидеть каждое.
			</p>
		</div>
		<div class="flex flex-wrap gap-2 sm:ml-auto">
			<a class={buttonVariants({ variant: 'secondary' })} href={resolve('/crm/stock/inventories')}>
				Инвентаризации
			</a>
			{#if data.canManage}
				<Button onclick={() => (createOpen = true)}>Новая позиция</Button>
			{/if}
		</div>
	</div>

	<Card.Root>
		<Card.Content class="flex flex-col gap-4">
			<FilterBar {fields} bind:filters />
			<StockTable
				rows={data.items.rows}
				total={data.items.total}
				{query}
				onQueryChange={changeQuery}
				{exportUrl}
			/>
		</Card.Content>
	</Card.Root>
</div>

{#if data.canManage}
	<StockItemModal bind:open={createOpen} choices={data.choices} />
{/if}
