<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button, Checkbox, Input } from '$lib/ui';
	import type { CatalogFacetsDto, CatalogFilters } from '$lib/types/catalog';

	/*
	 * A plain GET form, like the "Применить / Сброс" panel of the mockup: the filters land in the
	 * url, the page reloads its data, and the form works without JavaScript too.
	 */
	let {
		facets,
		filters,
		categoryId,
		sort,
		dir,
		perPage
	}: {
		facets: CatalogFacetsDto;
		filters: CatalogFilters;
		categoryId: number;
		sort: string;
		dir: string;
		perPage: number;
	} = $props();

	const lengthFrom = $derived(
		filters.lengthFromMm === undefined ? '' : String(filters.lengthFromMm / 10)
	);
	const lengthTo = $derived(
		filters.lengthToMm === undefined ? '' : String(filters.lengthToMm / 10)
	);
	const hint = $derived(
		facets.lengthMm.min === null || facets.lengthMm.max === null
			? undefined
			: `В разделе от ${facets.lengthMm.min / 10} до ${facets.lengthMm.max / 10} см`
	);
</script>

<form
	method="GET"
	data-testid="catalog-filters"
	class="flex flex-col gap-6 rounded-card bg-surface-raised p-6 lg:sticky lg:top-28"
>
	<input type="hidden" name="sort" value={sort} />
	<input type="hidden" name="dir" value={dir} />
	<input type="hidden" name="perPage" value={perPage} />

	{#if facets.materials.length > 0}
		<fieldset class="flex flex-col gap-2.5">
			<legend class="mb-3 text-xs tracking-[0.14em] text-fg-faint uppercase">Материал</legend>
			{#each facets.materials as material (material.id)}
				<div class="flex items-center justify-between gap-2">
					<Checkbox
						name="material"
						value={String(material.id)}
						label={material.title}
						checked={filters.materialIds?.includes(material.id) ?? false}
					/>
					<span class="text-xs text-fg-faint">{material.productCount}</span>
				</div>
			{/each}
		</fieldset>
	{/if}

	{#if facets.colors.length > 0}
		<fieldset class="flex flex-col gap-2.5">
			<legend class="mb-3 text-xs tracking-[0.14em] text-fg-faint uppercase">Цвет</legend>
			{#each facets.colors as color (color.id)}
				<Checkbox
					name="color"
					value={String(color.id)}
					label={color.title}
					checked={filters.colorOptionIds?.includes(color.id) ?? false}
				/>
			{/each}
		</fieldset>
	{/if}

	<fieldset class="flex flex-col gap-2">
		<legend class="mb-3 text-xs tracking-[0.14em] text-fg-faint uppercase">Длина, см</legend>
		<div class="grid grid-cols-2 gap-2">
			<Input name="lengthFrom" label="от" value={lengthFrom} />
			<Input name="lengthTo" label="до" value={lengthTo} />
		</div>
		{#if hint}<p class="text-xs text-fg-faint">{hint}</p>{/if}
	</fieldset>

	<fieldset>
		<legend class="mb-3 text-xs tracking-[0.14em] text-fg-faint uppercase">Наличие</legend>
		<Checkbox name="inStock" value="1" label="Есть на складе" checked={filters.inStock === true} />
	</fieldset>

	<div class="flex gap-2">
		<Button type="submit" class="flex-1">Применить</Button>
		<Button variant="secondary" href={resolve(`/portal/catalog/${categoryId}`)}>Сброс</Button>
	</div>
</form>
