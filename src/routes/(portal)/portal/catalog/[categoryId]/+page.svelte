<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import CatalogFilters from '$lib/portal/catalog/CatalogFilters.svelte';
	import ProductCard from '$lib/portal/catalog/ProductCard.svelte';
	import SelectedFilters from '$lib/portal/catalog/SelectedFilters.svelte';
	import { Breadcrumbs, Card, EmptyState, Pagination, Select, type SelectOption } from '$lib/ui';
	import type { ListQuery } from '$lib/types/list';
	import { withListQuery } from '$lib/utils/list-url';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const sortOptions = $derived<SelectOption[]>([
		{ value: 'sortOrder', label: 'По умолчанию' },
		{ value: 'title', label: 'По названию' },
		// Both portal roles sort by the price they see: purchase for one, agency for the other (P7).
		{ value: 'price:asc', label: 'Сначала дешевле' },
		{ value: 'price:desc', label: 'Сначала дороже' }
	]);
	const perPageOptions = $derived<SelectOption[]>(
		data.perPageOptions.map((size) => ({ value: String(size), label: String(size) }))
	);
	const currentSort = $derived(data.sort === 'price' ? `price:${data.dir}` : data.sort);
	const query = $derived<ListQuery>({
		page: data.products.page,
		perPage: data.products.perPage,
		sort: data.sort,
		dir: data.dir === 'desc' ? 'desc' : 'asc'
	});

	const crumbs = $derived([
		{ label: 'Главная', href: resolve('/portal') },
		{ label: 'Каталог', href: resolve('/portal/catalog') },
		...data.view.path.slice(0, -1).map((category) => ({
			label: category.title,
			href: resolve(`/portal/catalog/${category.id}`)
		})),
		{ label: data.view.category.title }
	]);

	function navigate(url: URL): void {
		// Same page with a rewritten query string, so there is no route pattern to resolve.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(url, { keepFocus: true, noScroll: true });
	}

	function changeSort(value: string): void {
		const [sort = 'sortOrder', dir] = value.split(':');
		const url = new URL(page.url);
		url.searchParams.set('sort', sort);
		if (dir) url.searchParams.set('dir', dir);
		else url.searchParams.delete('dir');
		url.searchParams.delete('page');
		navigate(url);
	}

	function changePerPage(value: string): void {
		const url = new URL(page.url);
		url.searchParams.set('perPage', value);
		url.searchParams.delete('page');
		navigate(url);
	}
</script>

<svelte:head><title>{data.view.category.title}: каталог</title></svelte:head>

<div class="flex flex-col gap-4">
	<div class="px-2"><Breadcrumbs items={crumbs} /></div>

	<div class="flex flex-wrap items-end gap-x-5 gap-y-1 px-2">
		<h1 class="text-4xl sm:text-5xl">{data.view.category.title}</h1>
		<span class="pb-1.5 text-fg-muted">
			Моделей: {data.products.total}{data.user.canSeePrices ? ' · ваши цены по договору' : ''}
		</span>
	</div>

	<div class="grid grid-cols-1 items-start gap-6 lg:grid-cols-[17.5rem_1fr]">
		<CatalogFilters
			facets={data.facets}
			filters={data.filters}
			categoryId={data.view.category.id}
			sort={data.sort}
			dir={data.dir}
			perPage={data.products.perPage}
		/>

		<div class="flex flex-col gap-4">
			<Card.Root size="sm">
				<Card.Content class="flex flex-wrap items-end gap-4">
					<span data-testid="catalog-shown" class="pb-3 text-fg-muted">
						Показано {data.products.rows.length} из {data.products.total}
					</span>
					<div class="flex flex-wrap items-end gap-3 sm:ml-auto">
						<div class="w-48">
							<Select
								label="Сортировка"
								options={sortOptions}
								bind:value={() => currentSort, changeSort}
							/>
						</div>
						<div class="w-28">
							<Select
								label="На странице"
								options={perPageOptions}
								bind:value={() => String(data.products.perPage), changePerPage}
							/>
						</div>
					</div>
				</Card.Content>
			</Card.Root>

			<SelectedFilters facets={data.facets} filters={data.filters} />

			{#if data.products.rows.length === 0}
				<EmptyState
					title="Ничего не нашлось"
					description="Измените условия или сбросьте фильтры."
				/>
			{:else}
				<div class="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
					{#each data.products.rows as product (product.id)}
						<ProductCard {product} />
					{/each}
				</div>
			{/if}

			<Pagination
				total={data.products.total}
				{query}
				onQueryChange={(next) => navigate(withListQuery(page.url, next))}
			/>
		</div>
	</div>
</div>
