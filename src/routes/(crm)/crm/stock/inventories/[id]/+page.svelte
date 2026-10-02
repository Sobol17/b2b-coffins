<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import InventoryLines from '$lib/crm/stock/InventoryLines.svelte';
	import { INVENTORY_STATUS_TITLE, KIND_PLURAL } from '$lib/crm/stock/labels';
	import { Breadcrumbs, Button, Card, TONE_CLASS, Textarea, withToast } from '$lib/ui';
	import { formatDateTime } from '$lib/utils/format';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const card = $derived(data.card);
	const editable = $derived(card.status === 'draft' && card.canManage);
	const title = $derived(`Инвентаризация № ${card.id}`);
</script>

<svelte:head><title>{title}</title></svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
	<Breadcrumbs
		items={[
			{ label: 'Склад', href: resolve('/crm/stock') },
			{ label: 'Инвентаризации', href: resolve('/crm/stock/inventories') },
			{ label: title }
		]}
	/>
	<div class="flex flex-wrap items-center gap-3">
		<h1 class="text-3xl">{title}</h1>
		<span
			class={[
				'rounded-pill px-2 py-0.5 text-xs',
				card.status === 'draft' ? TONE_CLASS.progress : TONE_CLASS.success
			]}
			data-testid="inventory-status"
		>
			{INVENTORY_STATUS_TITLE[card.status]}
		</span>
	</div>
	<p class="text-fg-muted">
		{KIND_PLURAL[card.kind]} · открыл {card.createdByName}
		{formatDateTime(card.createdAt, data.timezone)}
		{#if card.appliedAt}· проведена {formatDateTime(card.appliedAt, data.timezone)}{/if}
		· расхождений {card.diffCount} из {card.lineCount}
	</p>

	<Card.Root>
		<Card.Content>
			{#if editable}
				<form
					method="POST"
					action="?/save"
					class="flex flex-col gap-4"
					use:enhance={withToast({
						reset: false,
						success: (result) =>
							result?.['action'] === 'apply' ? 'Инвентаризация проведена' : 'Черновик сохранён'
					})}
				>
					<InventoryLines lines={card.lines} editable />
					<Textarea
						name="comment"
						label="Комментарий"
						placeholder="Введите комментарий"
						value={card.comment ?? ''}
						maxlength={500}
					/>
					<p class="text-sm text-fg-muted">
						«По учёту» показывает остаток на эту минуту. Проведение сверит факт с остатком ещё раз и
						запишет движение по каждой строке с расхождением.
					</p>
					<div class="flex flex-wrap gap-2">
						<Button type="submit" variant="secondary">Сохранить черновик</Button>
						<Button type="submit" formaction="?/apply">Провести</Button>
					</div>
				</form>
			{:else}
				<div class="flex flex-col gap-4">
					<InventoryLines lines={card.lines} editable={false} />
					{#if card.comment}<p class="text-sm text-fg-muted">{card.comment}</p>{/if}
				</div>
			{/if}
		</Card.Content>
	</Card.Root>

	{#if editable}
		<form method="POST" action="?/remove" use:enhance={withToast({ success: 'Черновик удалён' })}>
			<Button type="submit" variant="ghost" class="text-danger">Удалить черновик</Button>
		</form>
	{/if}
</div>
