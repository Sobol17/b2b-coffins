<script lang="ts">
	import { resolve } from '$app/paths';
	import PricePair from '$lib/portal/PricePair.svelte';
	import { Button } from '$lib/ui';
	import type { ProductListItemDto } from '$lib/types/catalog';
	import { formatLengthsCm } from '$lib/utils/format';
	import ProductPhoto from './ProductPhoto.svelte';

	let { product }: { product: ProductListItemDto } = $props();

	const details = $derived(
		[product.materialTitles.join(', '), formatLengthsCm(product.lengthsMm)]
			.filter((part) => part !== '')
			.join(' · ')
	);
</script>

<article data-testid="product-card" class="flex flex-col rounded-card bg-surface-raised p-3.5">
	<a href={resolve(`/portal/catalog/product/${product.id}`)} tabindex="-1" aria-hidden="true">
		<ProductPhoto mediaId={product.coverMediaId} alt="" class="aspect-[4/3]" />
	</a>
	<div class="flex flex-1 flex-col gap-1.5 px-1.5 pt-4 pb-1.5">
		<div class="text-xs tracking-[0.08em] text-fg-faint">{product.sku}</div>
		<h3 class="text-xl">
			<a href={resolve(`/portal/catalog/product/${product.id}`)} class="hover:text-brand">
				{product.title}
			</a>
		</h3>
		<div class="text-sm text-fg-muted">{details}</div>
		<div data-testid="product-price" class="mt-auto pt-3 font-heading text-2xl font-semibold">
			<PricePair
				agencyMinor={product.agencyPriceMinor}
				purchaseMinor={product.minPriceMinor}
				prefix={product.agencyPriceMinor === undefined ? 'от ' : undefined}
			/>
		</div>
		<div
			data-testid="product-stock"
			class={['text-xs', product.stockQty > 0 ? 'text-brand' : 'text-fg-muted']}
		>
			{product.stockQty > 0 ? `На складе ${product.stockQty} шт` : 'Нет на складе'}
		</div>
		<Button
			variant="secondary"
			size="sm"
			class="mt-2"
			href={resolve(`/portal/catalog/product/${product.id}`)}
		>
			Подробнее
		</Button>
	</div>
</article>
