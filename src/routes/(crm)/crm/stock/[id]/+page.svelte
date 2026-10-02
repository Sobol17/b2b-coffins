<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import MoveModal from '$lib/crm/stock/MoveModal.svelte';
	import MovesTable from '$lib/crm/stock/MovesTable.svelte';
	import StockItemFields from '$lib/crm/stock/StockItemFields.svelte';
	import { KIND_TITLE, MOVE_TYPE_TITLE } from '$lib/crm/stock/labels';
	import {
		Breadcrumbs,
		Button,
		Card,
		Checkbox,
		FilterBar,
		TONE_CLASS,
		withToast,
		type FilterField
	} from '$lib/ui';
	import { STOCK_MOVE_TYPES } from '$lib/types/dicts';
	import type { ListQuery } from '$lib/types/list';
	import { filtersOf, listQueryOf, withListQuery } from '$lib/utils/list-url';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const card = $derived(data.card);
	const fields: FilterField[] = [
		{
			key: 'type',
			label: 'Тип движения',
			type: 'select',
			placeholder: 'Выберите тип',
			options: [
				{ value: '', label: 'Все типы' },
				...STOCK_MOVE_TYPES.map((value) => ({ value, label: MOVE_TYPE_TITLE[value] }))
			]
		}
	];
	let filters = $state(filtersOf(page.url, ['type']));
	const query = $derived(listQueryOf(page.url, data.journal));
	const exportUrl = $derived(`${resolve(`/crm/stock/${card.id}/export.xlsx`)}${page.url.search}`);
	let moveOpen = $state(false);
	let isActive = $derived(card.isActive);

	function changeQuery(next: ListQuery): void {
		// Same page with a rewritten query string, so there is no route pattern to resolve.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(withListQuery(page.url, next), { keepFocus: true, noScroll: true });
	}
</script>

<svelte:head><title>{card.title}</title></svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
	<Breadcrumbs items={[{ label: 'Склад', href: resolve('/crm/stock') }, { label: card.title }]} />
	<div class="flex flex-wrap items-center gap-4">
		<div>
			<h1 class="text-3xl" data-testid="stock-title">{card.title}</h1>
			<p class="text-fg-muted">{card.code} · {KIND_TITLE[card.kind]}</p>
		</div>
		{#if card.canManage && card.isActive}
			<Button class="sm:ml-auto" onclick={() => (moveOpen = true)}>Движение</Button>
		{/if}
	</div>

	<div class="grid gap-6 lg:grid-cols-2">
		<Card.Root>
			<Card.Header><Card.Title>Остаток</Card.Title></Card.Header>
			<Card.Content class="flex flex-col gap-4">
				<div class="flex flex-wrap items-baseline gap-3">
					<span
						class={['text-4xl font-medium', card.balance < 0 ? 'text-danger' : '']}
						data-testid="stock-card-balance"
					>
						{card.balance}
					</span>
					<span class="text-fg-muted">{card.unitTitle}</span>
					{#if card.isNegative}
						<span class={['rounded-pill px-2 py-0.5 text-xs', TONE_CLASS.danger]}>Минус</span>
					{/if}
					{#if card.isBelowThreshold}
						<span class={['rounded-pill px-2 py-0.5 text-xs', TONE_CLASS.warning]}>
							Ниже порога {card.minThreshold}
						</span>
					{/if}
				</div>
				{#if card.kind === 'product' && card.positions.length > 0}
					<dl
						class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm"
						data-testid="stock-positions"
					>
						{#each card.positions as position (position.optionId)}
							<dt class="text-fg-muted">{position.colorTitle ?? 'Без цвета'}</dt>
							<dd class={['text-end', position.balance < 0 ? 'text-danger' : '']}>
								{position.balance}
							</dd>
						{/each}
					</dl>
				{/if}
				<p class="text-sm text-fg-muted">Остаток складывается из движений в журнале ниже.</p>
			</Card.Content>
		</Card.Root>

		{#if card.canManage}
			<Card.Root>
				<Card.Header><Card.Title>Позиция</Card.Title></Card.Header>
				<Card.Content>
					<form
						method="POST"
						action="?/update"
						class="flex flex-col gap-4"
						use:enhance={withToast({ reset: false, success: 'Позиция сохранена' })}
					>
						<StockItemFields choices={data.choices} values={card} />
						<Checkbox name="isActive" label="Позиция активна" bind:checked={isActive} />
						<Button type="submit" class="self-start">Сохранить позицию</Button>
					</form>
				</Card.Content>
			</Card.Root>
		{/if}
	</div>

	<Card.Root>
		<Card.Header><Card.Title>Журнал движений</Card.Title></Card.Header>
		<Card.Content class="flex flex-col gap-4">
			<FilterBar {fields} bind:filters />
			<MovesTable
				rows={data.journal.rows}
				total={data.journal.total}
				{query}
				onQueryChange={changeQuery}
				{exportUrl}
				timeZone={data.timezone}
			/>
		</Card.Content>
	</Card.Root>
</div>

{#if card.canManage}
	<MoveModal bind:open={moveOpen} {card} choices={data.choices} />
{/if}
