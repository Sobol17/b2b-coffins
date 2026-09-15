<script lang="ts">
	import { resolve } from '$app/paths';
	import ProductCard from '$lib/portal/catalog/ProductCard.svelte';
	import ProductConfigurator from '$lib/portal/catalog/ProductConfigurator.svelte';
	import ProductGallery from '$lib/portal/catalog/ProductGallery.svelte';
	import ProductSpecs from '$lib/portal/catalog/ProductSpecs.svelte';
	import { Breadcrumbs, Button } from '$lib/ui';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let selectedId = $state<number | null>(null);
	const variant = $derived(
		data.product.variants.find((item) => item.id === selectedId) ?? data.product.variants[0]
	);

	const crumbs = $derived([
		{ label: 'Главная', href: resolve('/portal') },
		{ label: 'Каталог', href: resolve('/portal/catalog') },
		...data.path.map((category) => ({
			label: category.title,
			href: resolve(`/portal/catalog/${category.id}`)
		})),
		{ label: `${data.product.sku} ${data.product.title}` }
	]);
</script>

<svelte:head><title>{data.product.title}: каталог</title></svelte:head>

<div class="flex flex-col gap-6">
	<div class="px-2"><Breadcrumbs items={crumbs} /></div>

	<div class="grid items-start gap-6 lg:grid-cols-[1fr_27.5rem]">
		<div class="flex flex-col gap-6">
			<ProductGallery mediaIds={data.product.mediaIds} title={data.product.title} />
			<ProductSpecs product={data.product} {variant} />
		</div>
		<ProductConfigurator
			product={data.product}
			bind:selectedId
			manager={data.counterparty.manager}
		/>
	</div>

	{#if data.similar.length > 0}
		<section class="flex flex-col gap-4">
			<div class="flex flex-wrap items-baseline gap-4 px-2">
				<h2 class="text-3xl">Похожие позиции</h2>
				{#if data.product.categoryId !== null}
					<Button
						variant="ghost"
						class="ml-auto"
						href={resolve(`/portal/catalog/${data.product.categoryId}`)}
					>
						Все модели группы
					</Button>
				{/if}
			</div>
			<div class="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
				{#each data.similar as product (product.id)}
					<ProductCard {product} />
				{/each}
			</div>
		</section>
	{/if}
</div>
