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

	$effect(() => {
		const source = new EventSource('/api/stream/charity');
		source.onmessage = (event: MessageEvent<string>) => {
			const message = parseCharityMessage(event.data);
			if (message) live = message;
		};
		return () => source.close();
	});
</script>

<Card.Root data-testid="charity-banner" class="bg-tone-info-soft">
	<Card.Content class="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
		<div class="flex max-w-xl flex-col gap-2">
			<div class="text-xs tracking-[0.1em] text-tone-info uppercase">Благотворительность</div>
			<h2 class="text-2xl">
				Часть суммы каждой доставленной заявки мастерская перечисляет в фонд
				{#if banner.fundUrl}
					<!-- eslint-disable svelte/no-navigation-without-resolve -- the fund site is external, not an app route resolve() could check -->
					<a
						data-testid="charity-fund"
						class="text-brand underline hover:text-brand-hover"
						href={banner.fundUrl}
						target="_blank"
						rel="noopener noreferrer">«{banner.fundTitle}»</a
					>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				{:else}
					<span data-testid="charity-fund" class="text-brand">«{banner.fundTitle}»</span>
				{/if}
			</h2>
			{#if banner.ownTotalMinor !== undefined}
				<p data-testid="charity-own" class="text-fg-muted">
					Вклад ваших заявок: {formatMinor(banner.ownTotalMinor)} ₽
				</p>
			{/if}
		</div>

		<dl class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:shrink-0">
			<div class="col-span-2 rounded-inset bg-surface-raised p-4 sm:col-span-1">
				<dt class="text-xs tracking-[0.1em] text-fg-faint uppercase">Собрано всего</dt>
				<dd data-testid="charity-total" class="font-heading text-3xl font-semibold text-brand">
					<AnimatedCounter valueMinor={totalMinor} /> ₽
				</dd>
			</div>
			<div class="rounded-inset bg-surface-raised p-4">
				<dt class="text-xs tracking-[0.1em] text-fg-faint uppercase">В этом году</dt>
				<dd data-testid="charity-year" class="font-heading text-3xl font-semibold">
					<AnimatedCounter valueMinor={yearMinor} /> ₽
				</dd>
			</div>
			<div class="rounded-inset bg-surface-raised p-4">
				<dt class="text-xs tracking-[0.1em] text-fg-faint uppercase">Заявок</dt>
				<dd data-testid="charity-count" class="font-heading text-3xl font-semibold tabular-nums">
					{requestCount}
				</dd>
			</div>
		</dl>
	</Card.Content>
</Card.Root>
