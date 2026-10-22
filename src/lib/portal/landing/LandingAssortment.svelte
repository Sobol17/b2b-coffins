<script lang="ts">
	// Sections of the price list of 01.06.2026. The guest gets the kinds, prices stay in the portal.
	const groups = [
		{
			title: 'Гробы',
			kinds: [
				'Эконом и крафт',
				'Классика: славянский, шестигранный, римский, восьмигранный',
				'С узором, тиснением и багетом',
				'Массив дерева',
				'Двухкрышечные',
				'Эксклюзивные: «Ангел», «Роза», христианский'
			]
		},
		{
			title: 'Кресты и фигуры',
			kinds: [
				'Кресты могильные деревянные',
				'Крест на крышку гроба',
				'Объёмные фигуры из искусственного камня'
			]
		}
	] as const;
</script>

<section id="assortment" class="mx-auto max-w-shell px-4 pt-8 sm:px-6">
	<h2 class="mb-5 px-2 text-3xl sm:text-4xl">Ассортимент</h2>
	<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
		{#each groups as group (group.title)}
			<div class="rounded-card bg-surface-raised p-7">
				<h3 class="mb-5 text-3xl">{group.title}</h3>
				<ul class="flex flex-col gap-2 text-fg-muted">
					{#each group.kinds as kind (kind)}<li>{kind}</li>{/each}
				</ul>
			</div>
		{/each}
	</div>
	<p class="mt-4 px-2 text-fg-muted">
		Доставка входит в стоимость изделия. Изготовим гроб по индивидуальным размерам и со стеклом.
	</p>
</section>
