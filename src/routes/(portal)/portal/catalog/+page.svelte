<script lang="ts">
	import { resolve } from '$app/paths';
	import CategoryGroup from '$lib/portal/catalog/CategoryGroup.svelte';
	import { Breadcrumbs, buttonVariants } from '$lib/ui';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Каталог</title></svelte:head>

<div class="flex flex-col gap-6">
	<div class="px-2">
		<Breadcrumbs items={[{ label: 'Главная', href: resolve('/portal') }, { label: 'Каталог' }]} />
	</div>

	<div class="flex flex-wrap items-end gap-x-6 gap-y-2 px-2">
		<h1 class="text-4xl sm:text-5xl">Каталог</h1>
		<span data-testid="catalog-summary" class="pb-1.5 text-fg-muted">
			Моделей: {data.total}, групп: {data.groups.length}.
			{#if data.user.canSeePrices}Цены по вашему договору.{:else}Цены вашего агентства.{/if}
		</span>
		{#if data.user.canSeePrices}
			<!-- A file download, not a page: the browser saves it instead of navigating. -->
			<a
				href={resolve('/portal/catalog/price-list.xlsx')}
				download
				data-sveltekit-reload
				data-testid="price-list-download"
				class={buttonVariants({ variant: 'secondary', class: 'sm:ml-auto' })}
			>
				Скачать прайс-лист XLSX
			</a>
		{/if}
	</div>

	{#each data.groups as group, index (group.category.id)}
		<CategoryGroup {group} number={index + 1} />
	{/each}
</div>
