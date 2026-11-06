<script lang="ts">
	import { asset } from '$app/paths';
	import type { PublicCatalogProductDto } from '$lib/types/public-catalog';
	import { formatDimensionsCm } from '$lib/utils/format';

	let { product }: { product: PublicCatalogProductDto } = $props();
</script>

<article
	data-testid="public-catalog-product"
	class="min-w-0 rounded-card bg-surface-raised p-4 sm:p-5"
>
	{#if product.coverMediaId !== null}
		<img
			src="/api/public/works/{product.coverMediaId}"
			alt={product.title}
			loading="lazy"
			decoding="async"
			class="aspect-[4/3] w-full rounded-inset bg-surface-muted object-cover"
		/>
	{:else}
		<div
			class="flex aspect-[4/3] items-center justify-center rounded-inset bg-surface-muted"
			aria-hidden="true"
		>
			<img
				src={asset('/brand/mark.png')}
				alt=""
				width="80"
				height="80"
				class="size-20 rounded-inset opacity-25 grayscale"
			/>
		</div>
	{/if}
	<div class="pt-4">
		{#if product.categoryTitle}<p class="mb-1 text-sm text-fg-faint">
				{product.categoryTitle}
			</p>{/if}
		<h2 class="text-2xl break-words">{product.title}</h2>
		<p class="mt-1 text-sm break-all text-fg-faint">Артикул: {product.sku}</p>
		{#if product.description}<p class="mt-3 break-words whitespace-pre-line text-fg-muted">
				{product.description}
			</p>{/if}
		{#if product.variants.length > 0}
			<h3 class="mt-5 text-base font-medium">Размеры и материалы</h3>
			<ul class="mt-2 divide-y divide-border text-sm">
				{#each product.variants as variant (variant.id)}
					<li class="py-2.5 first:pt-0 last:pb-0">
						<p class="break-words">{variant.sizeCode} · {variant.materialTitle}</p>
						{#if variant.lengthMm !== null || variant.widthMm !== null || variant.heightMm !== null}
							<p class="mt-1 text-fg-faint">
								{formatDimensionsCm(variant.lengthMm, variant.widthMm, variant.heightMm)}
							</p>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</article>
