<script lang="ts">
	const steps = [
		{
			number: '01',
			title: 'Заявка и договор',
			text: 'Менеджер согласует условия поставки, скидку и график отгрузок. Договор в течение рабочего дня.'
		},
		{
			number: '02',
			title: 'Доступ в портал',
			text: 'Вход в закрытый портал: свои цены, каталог и история заявок.'
		},
		{
			number: '03',
			title: 'Заявки и отгрузка',
			text: 'Заявка собирается в портале из каталога. Отгрузка со склада ежедневно, доставка своим транспортом.'
		}
	] as const;
</script>

<section id="steps" class="mx-auto max-w-shell px-4 pt-12 sm:px-6">
	<h2 class="mb-5 px-2 text-3xl sm:text-4xl">Как мы работаем</h2>
	<div class="grid grid-cols-1 gap-6 md:grid-cols-3">
		{#each steps as step (step.number)}
			<div class="rounded-card bg-surface-raised p-8">
				<div class="mb-2 font-heading text-4xl font-semibold text-brand-500">{step.number}</div>
				<h3 class="mb-2 text-2xl">{step.title}</h3>
				<p class="text-fg-muted">{step.text}</p>
			</div>
		{/each}
	</div>
</section>
