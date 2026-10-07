<script lang="ts">
	import PushBanner from '$lib/notifications/PushBanner.svelte';
	import PlannedStop from '$lib/crm/delivery/PlannedStop.svelte';
	import ReadyStop from '$lib/crm/delivery/ReadyStop.svelte';
	import { Card, EmptyState, InstallPrompt } from '$lib/ui';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Доставка</title></svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
	<InstallPrompt />
	<PushBanner publicKey={data.push.publicKey} />
	<div>
		<h1 class="mb-2 text-3xl">Доставка</h1>
		<p class="max-w-2xl text-fg-muted">
			Погрузите позиции собранной заявки, отвезите её и отметьте доставку.
		</p>
	</div>

	<div class="grid gap-6 lg:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>Готовы к выдаче</Card.Title>
				<Card.Description>Срочные и ближние по сроку сверху.</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-3">
				{#each data.delivery.ready as stop (stop.id)}
					<ReadyStop {stop} timeZone={data.timezone} />
				{:else}
					<EmptyState title="Собранных заявок нет" />
				{/each}
				{#if data.delivery.readyTotal > data.delivery.ready.length}
					<p class="text-sm text-fg-muted">
						Показаны {data.delivery.ready.length} из {data.delivery.readyTotal}.
					</p>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>В работе</Card.Title>
				<Card.Description
					>Заявки, которые цех ещё собирает: план следующих поездок.</Card.Description
				>
			</Card.Header>
			<Card.Content class="flex flex-col gap-3">
				{#each data.delivery.planned as stop (stop.id)}
					<PlannedStop {stop} timeZone={data.timezone} />
				{:else}
					<EmptyState title="Заявок в работе нет" />
				{/each}
				{#if data.delivery.plannedTotal > data.delivery.planned.length}
					<p class="text-sm text-fg-muted">
						Показаны {data.delivery.planned.length} из {data.delivery.plannedTotal}.
					</p>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>
</div>
