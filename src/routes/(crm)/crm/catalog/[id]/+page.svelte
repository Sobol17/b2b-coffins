<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import ProductForm from '$lib/crm/catalog/ProductForm.svelte';
	import ProductMedia from '$lib/crm/catalog/ProductMedia.svelte';
	import VariantForm from '$lib/crm/catalog/VariantForm.svelte';
	import VariantOptions from '$lib/crm/catalog/VariantOptions.svelte';
	import { Button, Card, withToast } from '$lib/ui';
	import type { CrmVariantDto } from '$lib/types/crm-catalog';
	import { formatMinor } from '$lib/utils/format';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let editing = $state<CrmVariantDto | 'new' | null>(null);
	let matrixId = $state<number | null>(null);
</script>

<svelte:head><title>{data.product.title} · Каталог CRM</title></svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
	<div>
		<a href={resolve('/crm/catalog')} class="text-sm text-link">← Каталог</a>
		<h1 class="mt-2 text-3xl">{data.product.title}</h1>
		<p class="text-fg-muted">{data.product.sku}</p>
	</div>
	<ProductForm product={data.product} categories={data.categories} />
	<ProductMedia product={data.product} />
	<Card.Root
		><Card.Content class="flex flex-col gap-4">
			<div class="flex flex-wrap items-center gap-3">
				<h2 class="flex-1 text-2xl">Варианты</h2>
				<a href={resolve('/crm/catalog/options')} class="text-link">Цвета каталога</a>
				<Button onclick={() => (editing = 'new')} disabled={data.product.isDeleted}
					>Добавить вариант</Button
				>
			</div>
			{#if editing !== null}
				<div class="rounded-inset bg-surface-muted p-4">
					<h3 class="mb-4 text-xl">{editing === 'new' ? 'Новый вариант' : 'Изменить вариант'}</h3>
					{#key editing === 'new' ? 'new' : editing.id}
						<VariantForm
							variant={editing === 'new' ? null : editing}
							choices={data.choices}
							canSeeCost={data.canSeeCost}
							onDone={() => (editing = null)}
						/>
					{/key}
				</div>
			{/if}
			{#if data.product.variants.length === 0}<p class="text-fg-muted">
					Вариантов пока нет. Добавьте вариант, затем опубликуйте модель.
				</p>{/if}
			{#each data.product.variants as variant (variant.id)}
				<div class="rounded-inset border border-border p-4">
					<div class="flex flex-wrap items-start gap-3">
						<div class="min-w-56 flex-1">
							<h3 class="text-xl">{variant.sku} · {variant.sizeCode}</h3>
							<p class="text-sm text-fg-muted">
								{variant.isDeleted ? 'Удалён' : variant.isPublished ? 'Опубликован' : 'Скрыт'} · Базовая
								цена {formatMinor(variant.basePriceMinor)} ₽
								{#if data.canSeeCost && variant.costPriceMinor !== undefined}
									· Себестоимость {formatMinor(variant.costPriceMinor)} ₽{/if}
							</p>
							<p class="text-sm text-fg-muted">
								Учётная позиция: {data.choices.stockProducts.find(
									(row) => row.id === variant.stockItemId
								)?.title ?? 'не привязана'} · Норм активной версии: {variant.activeBomNorms.length}
							</p>
						</div>
						{#if !variant.isDeleted && !data.product.isDeleted}
							<Button variant="secondary" size="sm" onclick={() => (editing = variant)}
								>Изменить</Button
							>
							<Button
								variant="secondary"
								size="sm"
								onclick={() => (matrixId = matrixId === variant.id ? null : variant.id)}
								>Цвета</Button
							>
							<form
								method="POST"
								action="?/variantStatus"
								use:enhance={withToast({
									success: variant.isPublished ? 'Вариант скрыт' : 'Вариант опубликован'
								})}
							>
								<input type="hidden" name="id" value={variant.id} /><input
									type="hidden"
									name="isPublished"
									value={String(!variant.isPublished)}
								/>
								<Button type="submit" variant="secondary" size="sm"
									>{variant.isPublished ? 'Скрыть' : 'Опубликовать'}</Button
								>
							</form>
							<form
								method="POST"
								action="?/deleteVariant"
								use:enhance={withToast({ success: 'Вариант удалён' })}
							>
								<input type="hidden" name="id" value={variant.id} /><Button
									type="submit"
									variant="danger"
									size="sm">Удалить</Button
								>
							</form>
						{/if}
					</div>
					{#if matrixId === variant.id && !variant.isDeleted}<div
							class="mt-4 border-t border-border pt-4"
						>
							<VariantOptions {variant} options={data.options} />
						</div>{/if}
					{#if variant.activeBomNorms.length > 0}<ul class="mt-3 text-sm text-fg-muted">
							{#each variant.activeBomNorms as norm (norm.id)}<li>
									Комплектующее #{norm.componentId}: {norm.qtyPerUnitMilli} тысячных на изделие
								</li>{/each}
						</ul>{/if}
				</div>
			{/each}
		</Card.Content></Card.Root
	>
</div>
