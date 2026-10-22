<script lang="ts">
	const stages = [
		{ title: 'Сушка', caption: 'Камерная, влажность 8–10 %' },
		{ title: 'Сборка', caption: 'Шиповое соединение' },
		{ title: 'Отделка', caption: 'Лак, полировка, тиснение' },
		{ title: 'Обивка', caption: 'Атлас, велюр, шёлк' }
	] as const;
</script>

<section id="production" class="mx-auto max-w-shell px-4 pt-12 sm:px-6">
	<div class="grid grid-cols-1 gap-8 rounded-card bg-surface-raised p-6 sm:p-10 lg:grid-cols-2">
		<div>
			<h2 class="mb-4 text-3xl sm:text-4xl">Производство</h2>
			<p class="max-w-xl text-fg-muted">
				Фабрика работает на собственной площадке в Иркутске. Пиломатериал проходит камерную сушку,
				корпус собирается на шип, отделка и обивка выполняются в отдельном цехе. Партия от 20 штук
				изготавливается за три рабочих дня.
			</p>
		</div>
		<div class="grid content-start gap-3 sm:grid-cols-2">
			{#each stages as stage (stage.title)}
				<div class="rounded-inset bg-surface-muted p-5">
					<div class="font-heading text-xl font-semibold">{stage.title}</div>
					<div class="text-sm text-fg-muted">{stage.caption}</div>
				</div>
			{/each}
		</div>
	</div>
</section>
