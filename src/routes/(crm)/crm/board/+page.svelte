<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { REQUEST_FILTER_KEYS, requestFilterFields } from '$lib/crm/requests/filters';
	import { FLAG_TITLE, PRIORITY_TITLE, STOCK_TITLE } from '$lib/crm/requests/labels';
	import { FilterBar, KanbanBoard, buttonVariants, withToast, type KanbanItem } from '$lib/ui';
	import type { CrmRequestListItemDto } from '$lib/types/crm-request';
	import type { RequestStatus } from '$lib/types/request';
	import { formatDayMonth } from '$lib/utils/format';
	import { filtersOf } from '$lib/utils/list-url';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const fields = $derived(requestFilterFields(data.counterparties, false));
	let filters = $state(filtersOf(page.url, REQUEST_FILTER_KEYS));

	const cards = $derived(data.board.columns.flatMap((column) => column.cards));
	const totals = $derived(
		Object.fromEntries(data.board.columns.map((column) => [column.status, column.total]))
	);
	const columns = $derived(data.board.columns.map((column) => column.status));
	const items = $derived(cards.map(toItem));

	function toItem(card: CrmRequestListItemDto): KanbanItem {
		const who = card.isStockRequest ? STOCK_TITLE : (card.counterpartyName ?? '');
		const when = card.deliveryAt ? `срок ${formatDayMonth(card.deliveryAt, data.timezone)}` : '';
		return {
			id: card.id,
			status: card.status,
			title: card.number,
			subtitle: [who, card.firstItemTitle, when].filter(Boolean).join(' · '),
			href: resolve(`/crm/requests/${card.id}`),
			tags: [
				...(card.priority === 'urgent' ? [PRIORITY_TITLE.urgent] : []),
				...card.flags.map((flag) => FLAG_TITLE[flag])
			]
		};
	}

	let moveForm = $state<HTMLFormElement | undefined>();
	let moving = $state({ id: '', to: '' });

	// The drop is a form action like any other mutation: the server decides, the page reloads.
	function drop(id: number, status: RequestStatus): void {
		const card = cards.find((candidate) => candidate.id === id);
		if (card === undefined || card.status === status) return;
		moving = { id: String(id), to: status };
		queueMicrotask(() => moveForm?.requestSubmit());
	}
</script>

<svelte:head><title>Доска заявок</title></svelte:head>

<div class="flex w-full flex-col gap-6">
	<div class="flex flex-wrap items-end gap-4">
		<div>
			<h1 class="mb-2 text-3xl">Доска заявок</h1>
			<p class="max-w-2xl text-fg-muted">
				Шесть статусов основного потока. Перетащите карточку или сдвиньте её стрелками.
			</p>
		</div>
		<div class="flex flex-wrap gap-2 sm:ml-auto">
			<a class={buttonVariants({ variant: 'secondary' })} href={resolve('/crm/requests')}>
				Реестр
			</a>
			<a class={buttonVariants({ variant: 'primary' })} href={resolve('/crm/requests/new')}>
				Новая заявка
			</a>
		</div>
	</div>

	<FilterBar {fields} bind:filters />

	<form
		bind:this={moveForm}
		method="POST"
		action="?/move"
		class="hidden"
		use:enhance={withToast({ success: 'Статус заявки изменён' })}
	>
		<input type="hidden" name="id" value={moving.id} />
		<input type="hidden" name="to" value={moving.to} />
	</form>

	<div data-testid="request-board">
		<KanbanBoard {columns} {items} {totals} onDrop={drop} />
	</div>
</div>
