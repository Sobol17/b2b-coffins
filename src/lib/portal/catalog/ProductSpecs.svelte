<script lang="ts">
	import type { ProductDto, VariantDto } from '$lib/types/catalog';
	import { formatDimensionsCm, formatWeightKg } from '$lib/utils/format';

	let { product, variant }: { product: ProductDto; variant: VariantDto | undefined } = $props();

	const specs = $derived<ReadonlyArray<readonly [string, string]>>(
		variant
			? [
					['Артикул', variant.sku],
					['Материал корпуса', variant.materialTitle],
					['Типоразмер', variant.sizeCode],
					[
						'Длина × ширина × высота',
						formatDimensionsCm(variant.lengthMm, variant.widthMm, variant.heightMm)
					],
					['Вес', formatWeightKg(variant.weightG)],
					['Группа', product.categoryTitle ?? '—']
				]
			: [['Артикул', product.sku]]
	);
</script>

<div class="grid grid-cols-1 gap-12 rounded-card bg-surface-raised p-6 sm:p-8 md:grid-cols-2">
	<div>
		<h2 class="mb-3.5 text-2xl">Характеристики</h2>
		<dl data-testid="product-specs">
			{#each specs as [label, value] (label)}
				<div
					class="flex justify-between gap-5 border-b border-border py-3 text-[0.9rem] last:border-b-0"
				>
					<dt class="text-fg-muted">{label}</dt>
					<dd class="text-right">{value}</dd>
				</div>
			{/each}
		</dl>
	</div>
	<div>
		<h2 class="mb-3.5 text-2xl">Описание</h2>
		<p class="text-neutral-800">{product.description ?? 'Описание готовится.'}</p>
	</div>
</div>
