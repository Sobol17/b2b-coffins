<script lang="ts">
	import SectionTabs from '$lib/crm/SectionTabs.svelte';
	import { STOCK_TABS } from '$lib/crm/sections';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import InventoriesTable from '$lib/crm/stock/InventoriesTable.svelte';
	import { KIND_OPTIONS } from '$lib/crm/stock/labels';
	import { Button, Card, Modal, Select, Textarea, withToast } from '$lib/ui';
	import type { ListQuery } from '$lib/types/list';
	import { listQueryOf, withListQuery } from '$lib/utils/list-url';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const query = $derived(listQueryOf(page.url, data.inventories));
	let createOpen = $state(false);
	let kind = $state<string>('component');
	let pending = $state(false);

	function changeQuery(next: ListQuery): void {
		// Same page with a rewritten query string, so there is no route pattern to resolve.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(withListQuery(page.url, next), { keepFocus: true, noScroll: true });
	}
</script>

<svelte:head><title>Инвентаризации</title></svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
	<SectionTabs tabs={STOCK_TABS} label="Склад" />
	<div class="flex flex-wrap items-end gap-4">
		<div>
			<h1 class="mb-2 text-3xl">Инвентаризации</h1>
			<p class="max-w-2xl text-fg-muted">
				Черновик хранит пересчёт. Проведение приводит учёт к факту одной операцией.
			</p>
		</div>
		{#if data.canManage}
			<Button class="sm:ml-auto" onclick={() => (createOpen = true)}>Новая инвентаризация</Button>
		{/if}
	</div>

	<Card.Root>
		<Card.Content>
			<InventoriesTable
				rows={data.inventories.rows}
				total={data.inventories.total}
				{query}
				onQueryChange={changeQuery}
				timeZone={data.timezone}
			/>
		</Card.Content>
	</Card.Root>
</div>

<Modal
	bind:open={createOpen}
	title="Новая инвентаризация"
	description="В черновик попадут все активные позиции выбранного вида."
>
	{#snippet body()}
		<form
			method="POST"
			action="?/create"
			class="flex flex-col gap-4"
			use:enhance={withToast({
				pending: (value) => (pending = value),
				success: 'Черновик открыт'
			})}
		>
			<Select
				name="kind"
				label="Вид"
				options={KIND_OPTIONS}
				placeholder="Выберите вид"
				required
				bind:value={kind}
			/>
			<Textarea
				name="comment"
				label="Комментарий"
				placeholder="Введите комментарий"
				maxlength={500}
			/>
			<Button type="submit" loading={pending} class="self-start">Открыть черновик</Button>
		</form>
	{/snippet}
</Modal>
