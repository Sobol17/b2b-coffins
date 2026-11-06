<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import CookieNotice from '$lib/legal/CookieNotice.svelte';
	import LandingFooter from '$lib/portal/landing/LandingFooter.svelte';
	import LandingHeader from '$lib/portal/landing/LandingHeader.svelte';
	import LandingSky from '$lib/portal/landing/LandingSky.svelte';
	import { telHrefOf } from '$lib/portal/landing/tel';
	import { Button, EmptyState, FilterBar, Pagination, type FilterField } from '$lib/ui';
	import type { ListQuery } from '$lib/types/list';
	import { filtersOf, listQueryOf, withListQuery } from '$lib/utils/list-url';
	import ProductCard from './ProductCard.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const telHref = $derived(telHrefOf(data.contacts.phone));
	const query = $derived(listQueryOf(page.url, data.products));
	const filters = $derived(filtersOf(page.url, ['search', 'categoryId']));
	const fields = $derived<FilterField[]>([
		{ key: 'search', type: 'text', label: 'Поиск', placeholder: 'Название или артикул' },
		{
			key: 'categoryId',
			type: 'select',
			label: 'Категория',
			placeholder: 'Все категории',
			options: data.categories.map((category) => ({
				value: String(category.id),
				label: category.title
			}))
		}
	]);

	function changeQuery(next: ListQuery): void {
		// The shared helper preserves filters in the current route's URL.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(withListQuery(page.url, next), { keepFocus: true, noScroll: true });
	}
</script>

<svelte:head>
	<title>Каталог изделий фабрики «Ангел»</title>
	<meta
		name="description"
		content="Гробы, кресты и ритуальные изделия фабрики «Ангел» в Иркутске. Модели, материалы и размеры."
	/>
	<link rel="canonical" href="{data.origin}/catalog" />
</svelte:head>

<LandingSky />
<div class="flex min-h-screen flex-col">
	<LandingHeader phone={data.contacts.phone} {telHref} catalogActive />
	<main class="mx-auto w-full max-w-shell flex-1 px-4 pt-8 pb-12 sm:px-6">
		<div class="mb-6 px-2">
			<h1 class="text-4xl sm:text-5xl">Каталог</h1>
			<p class="mt-3 max-w-2xl text-fg-muted">
				Модели собственного производства. Выберите категорию или найдите изделие по названию и
				артикулу.
			</p>
		</div>
		<div class="mb-6 rounded-card bg-surface-raised p-5">
			<FilterBar {fields} {filters} />
		</div>
		<p class="mb-4 px-2 text-sm text-fg-muted" role="status">
			Найдено моделей: {data.products.total}
		</p>
		{#if data.products.rows.length > 0}
			<div class="grid items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
				{#each data.products.rows as product (product.id)}<ProductCard {product} />{/each}
			</div>
		{:else}
			<div class="rounded-card bg-surface-raised">
				<EmptyState
					title="Модели не найдены"
					description="Попробуйте другое название или сбросьте фильтры."
				>
					{#snippet action()}<Button href={resolve('/catalog')} variant="secondary"
							>Показать все модели</Button
						>{/snippet}
				</EmptyState>
			</div>
		{/if}
		<div class="mt-6">
			<Pagination total={data.products.total} {query} onQueryChange={changeQuery} />
		</div>
	</main>
	<LandingFooter contacts={data.contacts} {telHref} />
</div>
<CookieNotice />
