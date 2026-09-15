<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button, PriceCell } from '$lib/ui';
	import type { CategoryGroupDto } from '$lib/types/catalog';
	import ProductPhoto from './ProductPhoto.svelte';

	let { group, number }: { group: CategoryGroupDto; number: number } = $props();
</script>

<section
	data-testid="category-group"
	class="grid gap-8 rounded-card bg-surface-raised p-6 sm:p-10 lg:grid-cols-[20rem_1fr]"
>
	<div>
		<div class="mb-3 text-xs tracking-[0.14em] text-fg-faint uppercase">
			Группа {String(number).padStart(2, '0')}
		</div>
		<h2 class="mb-3 text-3xl sm:text-4xl">{group.category.title}</h2>
		<p class="text-fg-muted">
			Моделей: {group.category.productCount}
			{#if group.category.minPriceMinor !== undefined}
				· от <PriceCell valueMinor={group.category.minPriceMinor} /> ₽
			{/if}
		</p>
		<Button variant="secondary" class="mt-4" href={resolve(`/portal/catalog/${group.category.id}`)}>
			Все модели группы
		</Button>
	</div>

	<div class="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
		{#each group.children as child (child.id)}
			<a
				href={resolve(`/portal/catalog/${child.id}`)}
				class="flex flex-col overflow-hidden rounded-inset bg-surface-muted hover:bg-chip"
			>
				<ProductPhoto mediaId={null} alt="" caption={child.title} class="aspect-[5/4]" />
				<div class="p-4">
					<div class="font-heading text-xl font-semibold">{child.title}</div>
					<div class="text-sm text-fg-muted">
						Моделей: {child.productCount}
						{#if child.minPriceMinor !== undefined}
							· от <PriceCell valueMinor={child.minPriceMinor} /> ₽
						{/if}
					</div>
				</div>
			</a>
		{/each}

		{#each group.showcase as product (product.id)}
			<a
				data-testid="showcase-tile"
				href={resolve(`/portal/catalog/product/${product.id}`)}
				class="flex flex-col overflow-hidden rounded-inset bg-surface-muted hover:bg-chip"
			>
				<ProductPhoto mediaId={product.coverMediaId} alt="" class="aspect-[5/4]" />
				<div class="p-4">
					<div class="font-heading text-xl font-semibold">{product.title}</div>
					<div class="text-sm text-fg-muted">
						Размеров: {product.variantCount}
						{#if product.minPriceMinor !== undefined}
							· от <PriceCell valueMinor={product.minPriceMinor} /> ₽
						{/if}
					</div>
				</div>
			</a>
		{/each}
	</div>
</section>
