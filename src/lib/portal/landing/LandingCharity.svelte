<script lang="ts">
	import type { LandingCharityDto } from '$lib/types/landing';

	/*
	 * The charity block (P13): who the fund is and what share of a request goes to it. Collected
	 * sums belong to the portal banner of P8; a guest gets the promise, not the figures.
	 */
	let { charity }: { charity: LandingCharityDto } = $props();

	const rate = $derived(
		new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(charity.ratePercent)
	);
</script>

<section id="charity" class="mx-auto max-w-shell px-4 pt-12 sm:px-6">
	<div
		data-testid="landing-charity"
		class="grid grid-cols-1 items-center gap-8 rounded-card bg-surface-raised p-8 sm:p-11 lg:grid-cols-[1fr_auto]"
	>
		<div>
			<h2 class="mb-2 text-3xl sm:text-4xl">Благотворительный проект</h2>
			<p class="max-w-2xl text-fg-muted">
				С каждой оплаченной заявки мастерская перечисляет
				<span class="text-fg">{rate} %</span>
				в
				{#if charity.fundUrl}
					<a
						class="text-link hover:underline"
						href={charity.fundUrl}
						rel="noopener noreferrer external"
						target="_blank">{charity.fundTitle}</a
					>
				{:else}
					<span class="text-fg">{charity.fundTitle}</span>
				{/if}. Отчисление считается от суммы заявки и не увеличивает цену для агентства.
			</p>
		</div>
		<div class="rounded-inset bg-surface-muted px-8 py-6 text-center">
			<div class="font-heading text-4xl font-semibold text-brand-500">{rate} %</div>
			<div class="text-sm text-fg-muted">с каждой заявки</div>
		</div>
	</div>
</section>
