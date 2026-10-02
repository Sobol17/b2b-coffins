<script lang="ts">
	import { resolve } from '$app/paths';
	import DeficitTable from '$lib/crm/bom/DeficitTable.svelte';
	import { Breadcrumbs, Card, EmptyState, buttonVariants } from '$lib/ui';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const deficit = $derived(data.deficit);
</script>

<svelte:head><title>Дефицит комплектующих</title></svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
	<Breadcrumbs items={[{ label: 'Склад', href: resolve('/crm/stock') }, { label: 'Дефицит' }]} />
	<div>
		<h1 class="mb-2 text-3xl">Дефицит комплектующих</h1>
		<p class="max-w-2xl text-fg-muted">
			Потребность равна недостающим изделиям заявок в работе, умноженным на норму. Дефицит это
			потребность сверх остатка склада.
		</p>
	</div>

	{#if deficit.version === null}
		<EmptyState title="Активной версии норм нет" description="Без норм потребность не считается.">
			{#snippet action()}
				<a class={buttonVariants({ variant: 'secondary' })} href={resolve('/crm/stock/norms')}>
					Открыть нормы
				</a>
			{/snippet}
		</EmptyState>
	{:else}
		<Card.Root>
			<Card.Header>
				<Card.Description>Расчёт по версии норм {deficit.version}.</Card.Description>
			</Card.Header>
			<Card.Content>
				<DeficitTable rows={deficit.rows} />
			</Card.Content>
		</Card.Root>
	{/if}
</div>
