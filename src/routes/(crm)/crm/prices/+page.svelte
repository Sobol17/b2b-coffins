<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import DiscountRuleForm from '$lib/crm/catalog/DiscountRuleForm.svelte';
	import PriceListForm from '$lib/crm/catalog/PriceListForm.svelte';
	import { Button, Card, Modal, buttonVariants, withToast } from '$lib/ui';
	import type { CrmDiscountRuleDto, CrmPriceListDto } from '$lib/types/crm-catalog';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	// null: closed; 'new': a new record; a record: the edit of that one.
	let editingList = $state<CrmPriceListDto | 'new' | null>(null);
	let editingRule = $state<CrmDiscountRuleDto | 'new' | null>(null);
	const currentList = $derived(editingList === 'new' ? null : editingList);
	const currentRule = $derived(editingRule === 'new' ? null : editingRule);
	const caption = (from: string | null, to: string | null) =>
		`${from ?? 'без начала'} — ${to ?? 'без конца'}`;
</script>

<svelte:head><title>Прайсы и скидки CRM</title></svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
	<div>
		<h1 class="mb-2 text-3xl">Прайсы и скидки</h1>
		<p class="max-w-2xl text-fg-muted">
			Прайс-лист задаёт цены вариантов, правило скидки уменьшает их для контрагента или категории.
		</p>
	</div>
	<Card.Root
		><Card.Content class="flex flex-col gap-4">
			<div class="flex flex-wrap items-center gap-3">
				<h2 class="flex-1 text-2xl">Прайс-листы</h2>
				<Button variant="secondary" onclick={() => (editingList = 'new')}
					>Добавить прайс-лист</Button
				>
			</div>
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
						<a
							href={resolve(`/crm/prices/${list.id}`)}
							class={buttonVariants({ variant: 'secondary', size: 'sm' })}>Позиции</a
						>
						<Button variant="ghost" size="sm" onclick={() => (editingList = list)}>Изменить</Button>
						<form
							method="POST"
							action="?/deleteList"
							use:enhance={withToast({ success: 'Прайс-лист удалён' })}
						>
							<input type="hidden" name="id" value={list.id} /><Button
								type="submit"
								variant="ghost"
								class="text-danger"
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
			<div class="flex flex-wrap items-center gap-3">
				<h2 class="flex-1 text-2xl">Правила скидки</h2>
				<Button variant="secondary" onclick={() => (editingRule = 'new')}>Добавить скидку</Button>
			</div>
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
						<Button variant="ghost" size="sm" onclick={() => (editingRule = rule)}>Изменить</Button>
						<form
							method="POST"
							action="?/deleteRule"
							use:enhance={withToast({ success: 'Правило удалено' })}
						>
							<input type="hidden" name="id" value={rule.id} /><Button
								type="submit"
								variant="ghost"
								class="text-danger"
								size="sm">Удалить</Button
							>
						</form>
					</li>
				{/each}
			</ul>
		</Card.Content></Card.Root
	>
</div>

<Modal
	open={editingList !== null}
	title={currentList ? 'Изменить прайс-лист' : 'Новый прайс-лист'}
	onClose={() => (editingList = null)}
>
	{#snippet body()}
		{#key currentList?.id}
			<PriceListForm list={currentList} onDone={() => (editingList = null)} />
		{/key}
	{/snippet}
</Modal>

<Modal
	open={editingRule !== null}
	title={currentRule ? 'Изменить скидку' : 'Новое правило скидки'}
	onClose={() => (editingRule = null)}
>
	{#snippet body()}
		{#key currentRule?.id}
			<DiscountRuleForm
				rule={currentRule}
				categories={data.categories}
				choices={data.choices}
				onDone={() => (editingRule = null)}
			/>
		{/key}
	{/snippet}
</Modal>
