<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import DiscountRuleForm from '$lib/crm/catalog/DiscountRuleForm.svelte';
	import PriceListForm from '$lib/crm/catalog/PriceListForm.svelte';
	import { Button, Card, withToast } from '$lib/ui';
	import type { CrmDiscountRuleDto, CrmPriceListDto } from '$lib/types/crm-catalog';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let editingList = $state<CrmPriceListDto | null>(null);
	let editingRule = $state<CrmDiscountRuleDto | null>(null);
	const caption = (from: string | null, to: string | null) =>
		`${from ?? 'без начала'} — ${to ?? 'без конца'}`;
</script>

<svelte:head><title>Прайсы и скидки CRM</title></svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
	<div>
		<a href={resolve('/crm/catalog')} class="text-sm text-link">← Каталог</a>
		<h1 class="mt-2 text-3xl">Прайсы и скидки</h1>
	</div>
	<Card.Root
		><Card.Content class="flex flex-col gap-4">
			<h2 class="text-2xl">{editingList ? 'Изменить прайс-лист' : 'Новый прайс-лист'}</h2>
			{#key editingList?.id}<PriceListForm
					list={editingList}
					onDone={() => (editingList = null)}
				/>{/key}
			{#if data.lists.length === 0}<p class="text-fg-muted">Прайс-листов пока нет.</p>{/if}
			<ul class="divide-y divide-border">
				{#each data.lists as list (list.id)}
					<li class="flex flex-wrap items-center gap-2 py-3">
						<div class="min-w-56 flex-1">
							<strong>{list.title}</strong>
							<p class="text-sm text-fg-muted">
								{list.isBase ? 'Базовый' : 'Персональный'} · {caption(list.validFrom, list.validTo)} ·
								позиций: {list.items.length}
							</p>
						</div>
						<a href={resolve(`/crm/prices/${list.id}`)} class="text-link">Позиции</a>
						<Button variant="secondary" size="sm" onclick={() => (editingList = list)}
							>Изменить</Button
						>
						<form
							method="POST"
							action="?/deleteList"
							use:enhance={withToast({ success: 'Прайс-лист удалён' })}
						>
							<input type="hidden" name="id" value={list.id} /><Button
								type="submit"
								variant="danger"
								size="sm">Удалить</Button
							>
						</form>
					</li>
				{/each}
			</ul>
		</Card.Content></Card.Root
	>
	<Card.Root
		><Card.Content class="flex flex-col gap-4">
			<h2 class="text-2xl">{editingRule ? 'Изменить скидку' : 'Новое правило скидки'}</h2>
			{#key editingRule?.id}<DiscountRuleForm
					rule={editingRule}
					categories={data.categories}
					choices={data.choices}
					onDone={() => (editingRule = null)}
				/>{/key}
			{#if data.rules.length === 0}<p class="text-fg-muted">Правил скидки пока нет.</p>{/if}
			<ul class="divide-y divide-border">
				{#each data.rules as rule (rule.id)}
					<li class="flex flex-wrap items-center gap-2 py-3">
						<div class="min-w-56 flex-1">
							<strong>{rule.percent} %</strong>
							<p class="text-sm text-fg-muted">
								{data.choices.counterparties.find((row) => row.id === rule.counterpartyId)?.name ??
									'Все контрагенты'} · {data.categories.find((row) => row.id === rule.categoryId)
									?.title ?? 'Все категории'} · {caption(rule.validFrom, rule.validTo)}
							</p>
						</div>
						<Button variant="secondary" size="sm" onclick={() => (editingRule = rule)}
							>Изменить</Button
						>
						<form
							method="POST"
							action="?/deleteRule"
							use:enhance={withToast({ success: 'Правило удалено' })}
						>
							<input type="hidden" name="id" value={rule.id} /><Button
								type="submit"
								variant="danger"
								size="sm">Удалить</Button
							>
						</form>
					</li>
				{/each}
			</ul>
		</Card.Content></Card.Root
	>
</div>
