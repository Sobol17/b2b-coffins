<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button, buttonVariants } from '$lib/ui';
	import TelLink from './TelLink.svelte';

	let { telHref }: { telHref: `tel:${string}` | null } = $props();

	// Standing facts only. Stock and catalog counters are data a guest does not get (tech.md 18.5).
	const facts = [
		{ value: 'от 3 дней', caption: 'срок изготовления партии' },
		{ value: 'Полный цикл', caption: 'сушка, сборка, отделка, обивка' },
		{ value: 'По договору', caption: 'с юридическими лицами и ИП' },
		{ value: 'Свой транспорт', caption: 'доставка со склада' }
	] as const;
</script>

<section class="mx-auto max-w-5xl px-4 pt-14 pb-12 text-center sm:px-6 sm:pt-22 sm:pb-18">
	<h1 class="mb-6 text-4xl sm:text-6xl">
		Гробы и кресты <span class="text-brand-500">собственного</span> производства
	</h1>
	<p class="mx-auto mb-8 max-w-2xl text-lg text-fg-muted">
		Оптовые поставки ритуальным агентствам. Полный цикл на одной площадке: сушка, сборка, отделка и
		обивка. Отгрузка со склада ежедневно, партия под заказ от трёх рабочих дней.
	</p>
	<div class="flex flex-wrap justify-center gap-3">
		{#if telHref}
			<TelLink href={telHref} testid="become-partner" class={buttonVariants({ size: 'lg' })}>
				Стать контрагентом
			</TelLink>
		{/if}
		<Button variant="secondary" size="lg" href={resolve('/login')}>Вход в портал</Button>
	</div>
</section>

<section class="mx-auto max-w-shell px-4 pb-6 sm:px-6">
	<div
		class="grid grid-cols-1 gap-6 rounded-card bg-surface-raised px-6 py-8 sm:grid-cols-2 sm:px-10 lg:grid-cols-4"
	>
		{#each facts as fact (fact.value)}
			<div>
				<div class="font-heading text-3xl font-semibold">{fact.value}</div>
				<div class="text-sm text-fg-muted">{fact.caption}</div>
			</div>
		{/each}
	</div>
</section>
