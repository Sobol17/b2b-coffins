<script lang="ts">
	import { resolve } from '$app/paths';
	import CrewPanel from '$lib/crm/requests/CrewPanel.svelte';
	import HistoryPanel from '$lib/crm/requests/HistoryPanel.svelte';
	import ItemsPanel from '$lib/crm/requests/ItemsPanel.svelte';
	import MovesPanel from '$lib/crm/requests/MovesPanel.svelte';
	import { FLAG_TITLE, PRIORITY_TITLE, STOCK_TITLE } from '$lib/crm/requests/labels';
	import { Breadcrumbs, Card, PriceCell, StatusBadge, TONE_CLASS } from '$lib/ui';
	import { formatDateTime } from '$lib/utils/format';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const card = $derived(data.card);
	const tags = $derived([
		...(card.priority === 'urgent' ? [PRIORITY_TITLE.urgent] : []),
		...card.flags.map((flag) => FLAG_TITLE[flag])
	]);
	const when = (iso: string | null) => (iso ? formatDateTime(iso, data.timezone) : '—');
</script>

<svelte:head><title>Заявка {card.number}</title></svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
	<Breadcrumbs
		items={[{ label: 'Заявки', href: resolve('/crm/requests') }, { label: card.number }]}
	/>
	<div class="flex flex-wrap items-center gap-3">
		<h1 class="text-3xl" data-testid="request-number">{card.number}</h1>
		<StatusBadge status={card.status} />
		{#each tags as tag (tag)}
			<span class={['rounded-pill px-3 py-0.5 text-xs', TONE_CLASS.warning]}>{tag}</span>
		{/each}
	</div>

	<MovesPanel targets={card.targets} refusalReasons={data.choices.refusalReasons} />

	<div class="grid gap-6 lg:grid-cols-[2fr_1fr]">
		<div class="flex min-w-0 flex-col gap-6">
			<ItemsPanel {card} variants={data.choices.variants} withMoney={data.user.canSeePrices} />
			<HistoryPanel steps={card.history} timeZone={data.timezone} />
		</div>
		<div class="flex min-w-0 flex-col gap-6">
			<Card.Root>
				<Card.Header><Card.Title>Отгрузка</Card.Title></Card.Header>
				<Card.Content>
					<dl class="flex flex-col gap-2 text-sm">
						<dt class="text-fg-muted">Контрагент</dt>
						<dd>
							{#if card.isStockRequest}
								{STOCK_TITLE}
							{:else if card.counterpartyId !== null}
								<a
									class="text-link hover:text-link-hover"
									href={resolve(`/crm/counterparties/${card.counterpartyId}`)}
								>
									{card.counterpartyName}
								</a>
							{/if}
						</dd>
						{#if !card.isStockRequest}
							<dt class="text-fg-muted">Адрес</dt>
							<dd>{card.deliveryAddress ?? '—'}</dd>
							<dt class="text-fg-muted">Срок доставки</dt>
							<dd>{when(card.deliveryAt)}</dd>
							<dt class="text-fg-muted">ФИО умершего</dt>
							<dd>{card.deceasedName ?? '—'}</dd>
						{/if}
						<dt class="text-fg-muted">Отправлена</dt>
						<dd>{when(card.submittedAt)} · {card.authorName ?? '—'}</dd>
						{#if card.externalNumber}
							<dt class="text-fg-muted">Номер контрагента</dt>
							<dd>{card.externalNumber}</dd>
						{/if}
						{#if card.comment}
							<dt class="text-fg-muted">Комментарий</dt>
							<dd class="whitespace-pre-line">{card.comment}</dd>
						{/if}
						{#if data.user.canSeePrices && card.paidMinor !== undefined}
							<dt class="text-fg-muted">Оплачено</dt>
							<dd><PriceCell valueMinor={card.paidMinor} /></dd>
						{/if}
					</dl>
				</Card.Content>
			</Card.Root>
			<CrewPanel {card} crew={data.choices.crew} />
			{#if card.attachments.length > 0}
				<Card.Root>
					<Card.Header><Card.Title>Вложения</Card.Title></Card.Header>
					<Card.Content>
						<ul class="flex flex-col gap-1 text-sm">
							{#each card.attachments as file (file.id)}
								<li>
									<a class="text-link hover:text-link-hover" href={resolve(`/api/files/${file.id}`)}
										>{file.name}</a
									>
								</li>
							{/each}
						</ul>
					</Card.Content>
				</Card.Root>
			{/if}
		</div>
	</div>
</div>
