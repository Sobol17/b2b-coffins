<script lang="ts">
	import { AnimatedCounter, Card } from '$lib/ui';
	import type { CharityBannerDto } from '$lib/types/charity';
	import { formatMinor } from '$lib/utils/format';
	import { parseCharityMessage, type CharityMessage } from './live-charity';

	let { banner }: { banner: CharityBannerDto } = $props();

	// The stream only ever adds to what the server rendered, so a fresh message simply wins.
	let live = $state<CharityMessage | null>(null);
	const totalMinor = $derived(live?.totalMinor ?? banner.publicTotalMinor);
	const yearMinor = $derived(live?.yearMinor ?? banner.publicYearMinor);
	const requestCount = $derived(live?.requestCount ?? banner.publicRequestCount);

	const FIGURE =
		'flex items-baseline justify-between gap-4 py-3 sm:block sm:rounded-inset sm:bg-surface-raised sm:p-4';
	const LABEL = 'text-xs tracking-[0.1em] text-fg-faint uppercase';
	const VALUE = 'font-heading text-2xl font-semibold whitespace-nowrap sm:text-3xl';

	$effect(() => {
		const source = new EventSource('/api/stream/charity');
		source.onmessage = (event: MessageEvent<string>) => {
			const message = parseCharityMessage(event.data);
			if (message) live = message;
		};
		return () => source.close();
	});
</script>

<!-- On a phone the figures fold into one white panel of label-value rows: three stacked tiles
     pushed the rest of the home page a screen down. -->
<Card.Root data-testid="charity-banner" class="bg-tone-info-soft">
	<Card.Content class="flex flex-col gap-5 sm:gap-6 lg:flex-row lg:items-center lg:justify-between">
		<div class="flex max-w-xl flex-col gap-2">
			<div class="text-xs tracking-[0.1em] text-tone-info uppercase">Благотворительность</div>
			<h2 class="text-xl sm:text-2xl">
				Часть суммы каждой доставленной заявки мастерская перечисляет в фонд
				{#if banner.fundUrl}
					<!-- eslint-disable svelte/no-navigation-without-resolve -- the fund site is external, not an app route resolve() could check -->
					<a
						data-testid="charity-fund"
						class="text-link underline hover:text-link-hover"
						href={banner.fundUrl}
						target="_blank"
						rel="noopener noreferrer">«{banner.fundTitle}»</a
					>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				{:else}
					<span data-testid="charity-fund" class="text-link">«{banner.fundTitle}»</span>
				{/if}
			</h2>
			{#if banner.ownTotalMinor !== undefined}
				<p data-testid="charity-own" class="text-fg-muted">
					Вклад ваших заявок: {formatMinor(banner.ownTotalMinor)} ₽
				</p>
			{/if}
		</div>

		<dl
			class="flex flex-col divide-y divide-border rounded-inset bg-surface-raised px-4 sm:grid sm:grid-cols-3 sm:gap-3 sm:divide-y-0 sm:bg-transparent sm:px-0 lg:shrink-0"
		>
			<div class={FIGURE}>
				<dt class={LABEL}>Собрано всего</dt>
				<dd data-testid="charity-total" class={[VALUE, 'text-link']}>
					<AnimatedCounter valueMinor={totalMinor} /> ₽
				</dd>
			</div>
			<div class={FIGURE}>
				<dt class={LABEL}>В этом году</dt>
				<dd data-testid="charity-year" class={VALUE}>
					<AnimatedCounter valueMinor={yearMinor} /> ₽
				</dd>
			</div>
			<div class={FIGURE}>
				<dt class={LABEL}>Заявок</dt>
				<dd data-testid="charity-count" class={[VALUE, 'tabular-nums']}>
					{requestCount}
				</dd>
			</div>
		</dl>
	</Card.Content>
</Card.Root>
