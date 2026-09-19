<script lang="ts">
	const groups = [
		{
			title: 'Гробы',
			kinds: ['Лакированные', 'Обитые тканью', 'Полированные', 'Двухкрышечные', 'Детские']
		},
		{ title: 'Кресты', kinds: ['Сосна', 'Дуб', 'С тиснением', 'С табличкой', 'Комплекты'] }
	] as const;
</script>

<section id="assortment" class="mx-auto max-w-shell px-4 pt-8 sm:px-6">
	<h2 class="mb-5 px-2 text-3xl sm:text-4xl">Ассортимент</h2>
	<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
		{#each groups as group (group.title)}
			<div class="grid grid-cols-1 gap-6 rounded-card bg-surface-raised p-7 sm:grid-cols-2">
				<div>
					<h3 class="mb-5 text-3xl">{group.title}</h3>
					<ul class="flex flex-col gap-2 text-fg-muted">
						{#each group.kinds as kind (kind)}<li>{kind}</li>{/each}
					</ul>
				</div>
				<div
					aria-hidden="true"
					class="flex min-h-40 items-end justify-center rounded-inset bg-surface-muted p-3 text-xs tracking-[0.08em] text-fg-faint uppercase sm:min-h-56"
				>
					фото группы
				</div>
			</div>
		{/each}
	</div>
</section>
