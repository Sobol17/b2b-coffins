<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/ui';
	import type { CatalogFacetsDto, CatalogFilters } from '$lib/types/catalog';

	let { facets, filters }: { facets: CatalogFacetsDto; filters: CatalogFilters } = $props();

	interface Chip {
		readonly key: string;
		readonly value?: string;
		readonly label: string;
	}

	const FILTER_KEYS = ['material', 'finish', 'lengthFrom', 'lengthTo', 'inStock'] as const;

	const chips = $derived.by((): Chip[] => [
		...(filters.materialIds ?? []).map((id) => ({
			key: 'material',
			value: String(id),
			label: facets.materials.find((material) => material.id === id)?.title ?? 'Материал'
		})),
		...(filters.finishOptionIds ?? []).map((id) => ({
			key: 'finish',
			value: String(id),
			label: facets.finishes.find((finish) => finish.id === id)?.title ?? 'Отделка'
		})),
		...(filters.lengthFromMm === undefined
			? []
			: [{ key: 'lengthFrom', label: `от ${filters.lengthFromMm / 10} см` }]),
		...(filters.lengthToMm === undefined
			? []
			: [{ key: 'lengthTo', label: `до ${filters.lengthToMm / 10} см` }]),
		...(filters.inStock ? [{ key: 'inStock', label: 'Есть на складе' }] : [])
	]);

	function remove(chip: Chip | null): void {
		const url = new URL(page.url);
		url.searchParams.delete('page');
		if (chip === null) {
			for (const key of FILTER_KEYS) url.searchParams.delete(key);
		} else if (chip.value === undefined) {
			url.searchParams.delete(chip.key);
		} else {
			const rest = url.searchParams.getAll(chip.key).filter((value) => value !== chip.value);
			url.searchParams.delete(chip.key);
			for (const value of rest) url.searchParams.append(chip.key, value);
		}
		// Same page with a rewritten query string, so there is no route pattern to resolve.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(url, { keepFocus: true, noScroll: true });
	}
</script>

{#if chips.length > 0}
	<div data-testid="selected-filters" class="flex flex-wrap items-center gap-2 px-1.5 text-sm">
		<span class="text-fg-faint">Выбрано:</span>
		{#each chips as chip (`${chip.key}:${chip.value ?? ''}`)}
			<Button
				variant="secondary"
				size="sm"
				class="bg-tone-info-soft text-tone-info"
				aria-label="Убрать фильтр: {chip.label}"
				onclick={() => remove(chip)}
			>
				{chip.label} ×
			</Button>
		{/each}
		<Button variant="ghost" size="sm" onclick={() => remove(null)}>Сбросить всё</Button>
	</div>
{/if}
