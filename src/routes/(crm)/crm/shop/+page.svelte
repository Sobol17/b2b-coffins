<script lang="ts">
	import ProductionQueue from '$lib/crm/shop/ProductionQueue.svelte';
	import RequestFill from '$lib/crm/shop/RequestFill.svelte';
	import { Button, Input } from '$lib/ui';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let search = $derived(data.search);
</script>

<svelte:head><title>Цех</title></svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
	<div>
		<h1 class="mb-2 text-3xl">Цех</h1>
		<p class="max-w-2xl text-fg-muted">
			Цех делает позиции, склад наполняет ими заявки. Отметьте, сколько штук сделано.
		</p>
	</div>

	<form method="GET" class="flex flex-wrap items-end gap-3" data-testid="shop-search">
		<div class="w-full max-w-xs">
			<Input label="Номер заявки" name="q" placeholder="Введите номер" bind:value={search} />
		</div>
		<Button type="submit" variant="secondary">Найти</Button>
	</form>

	<div class="grid gap-6 lg:grid-cols-2">
		<ProductionQueue queue={data.shop.queue} timeZone={data.timezone} />
		<RequestFill
			requests={data.shop.requests}
			total={data.shop.requestTotal}
			timeZone={data.timezone}
		/>
	</div>
</div>
