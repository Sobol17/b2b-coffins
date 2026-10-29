<script lang="ts">
	import { resolve } from '$app/paths';
	import PushBanner from '$lib/notifications/PushBanner.svelte';
	import StationTasks from '$lib/crm/shop/StationTasks.svelte';
	import { stationTitle } from '$lib/crm/shop/labels';
	import { Button, Card, Input, InstallPrompt, buttonVariants } from '$lib/ui';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let search = $derived(data.search);

	function stationHref(station: string) {
		const q = data.search ? `&q=${encodeURIComponent(data.search)}` : '';
		return `${resolve('/crm/shop')}?station=${station}${q}`;
	}
</script>

<svelte:head><title>Цех</title></svelte:head>

<div class="mx-auto flex w-full max-w-3xl flex-col gap-6">
	<InstallPrompt />
	<PushBanner publicKey={data.push.publicKey} />
	<div>
		<h1 class="mb-2 text-3xl">Цех</h1>
		<p class="text-fg-muted">Возьмите заявку в работу, отметьте сделанное и нажмите «Выполнено».</p>
	</div>

	{#if data.switches}
		<!-- The station links carry a query string, so they are built urls, not route patterns. -->
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		<nav class="flex flex-wrap gap-2" aria-label="Станции" data-testid="shop-stations">
			{#each data.stations as station (station)}
				<a
					class={buttonVariants({
						variant: station === data.station ? 'primary' : 'secondary',
						size: 'lg'
					})}
					href={stationHref(station)}
					aria-current={station === data.station ? 'page' : undefined}
				>
					{stationTitle(station)}
				</a>
			{/each}
		</nav>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	{/if}

	<form method="GET" class="flex flex-wrap items-end gap-3" data-testid="shop-search">
		{#if data.station}
			<input type="hidden" name="station" value={data.station} />
		{/if}
		<div class="w-full max-w-xs">
			<Input label="Номер заявки" name="q" placeholder="Введите номер" bind:value={search} />
		</div>
		<Button type="submit" variant="secondary" size="lg">Найти</Button>
	</form>

	{#each data.shop.stations as station (station.station)}
		<Card.Root data-testid="shop-station">
			<Card.Header>
				<Card.Title>{stationTitle(station.station)}</Card.Title>
				<Card.Description>Срочные и ближние по сроку сверху.</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-6">
				<StationTasks
					title="Новые"
					tasks={station.fresh}
					timeZone={data.timezone}
					empty="Новых заявок нет"
				/>
				<StationTasks
					title="В работе"
					tasks={station.taken}
					timeZone={data.timezone}
					empty="Заявок в работе нет"
				/>
				{#if station.total > station.fresh.length + station.taken.length}
					<p class="text-sm text-fg-muted">
						Показаны {station.fresh.length + station.taken.length} из {station.total}.
					</p>
				{/if}
			</Card.Content>
		</Card.Root>
	{/each}
</div>
