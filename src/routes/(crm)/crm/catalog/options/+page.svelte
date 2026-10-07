<script lang="ts">
	import SectionTabs from '$lib/crm/SectionTabs.svelte';
	import { CATALOG_TABS } from '$lib/crm/sections';
	import { enhance } from '$app/forms';
	import { Button, Card, Modal, Input, Select, withToast } from '$lib/ui';
	import type { CrmOptionDto } from '$lib/types/crm-catalog';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	// null: closed; 'new': a new colour; a colour: the edit of that one.
	let editing = $state<CrmOptionDto | 'new' | null>(null);
	const current = $derived(editing === 'new' ? null : editing);
	const stockChoices = $derived([
		{ value: '', label: 'Без учётной позиции' },
		...data.choices.stockComponents.map((row) => ({
			value: String(row.id),
			label: `${row.code} · ${row.title}`
		}))
	]);
</script>

<svelte:head><title>Цвета каталога</title></svelte:head>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
	<SectionTabs tabs={CATALOG_TABS} label="Каталог" />
	<div class="flex flex-wrap items-end gap-4">
		<div>
			<h1 class="mb-2 text-3xl">Цвета</h1>
			<p class="max-w-2xl text-fg-muted">Цвета, которые контрагент выбирает у варианта модели.</p>
		</div>
		<Button class="sm:ml-auto" onclick={() => (editing = 'new')}>Добавить цвет</Button>
	</div>
	<Card.Root
		><Card.Content>
			{#if data.options.length === 0}<p class="text-fg-muted">Цветов пока нет.</p>{/if}
			<ul class="divide-y divide-border">
				{#each data.options as option (option.id)}
					<li class="flex flex-wrap items-center gap-3 py-3">
						<div class="min-w-40 flex-1">
							<strong>{option.title}</strong>
							<p class="text-sm text-fg-muted">{option.isActive ? 'Используется' : 'Выключен'}</p>
						</div>
						<Button variant="secondary" size="sm" onclick={() => (editing = option)}
							>Изменить</Button
						>
						<form
							method="POST"
							action="?/active"
							use:enhance={withToast({
								success: option.isActive ? 'Цвет выключен' : 'Цвет включён'
							})}
						>
							<input type="hidden" name="id" value={option.id} /><input
								type="hidden"
								name="isActive"
								value={String(!option.isActive)}
							/>
							<Button
								type="submit"
								size="sm"
								variant="ghost"
								class={option.isActive ? 'text-danger' : undefined}
								>{option.isActive ? 'Выключить' : 'Включить'}</Button
							>
						</form>
					</li>
				{/each}
			</ul>
		</Card.Content></Card.Root
	>
</div>

<Modal
	open={editing !== null}
	title={current ? 'Изменить цвет' : 'Новый цвет'}
	onClose={() => (editing = null)}
>
	{#snippet body()}
		{#key current?.id}
			<form
				method="POST"
				action={current ? '?/update' : '?/create'}
				class="grid gap-4"
				use:enhance={withToast({
					success: current ? 'Цвет сохранён' : 'Цвет добавлен',
					onSuccess: () => (editing = null)
				})}
			>
				{#if current}<input type="hidden" name="id" value={current.id} />{/if}
				<input type="hidden" name="priceDeltaMinor" value="0" />
				<input type="hidden" name="isActive" value={String(current?.isActive ?? true)} />
				<Input
					name="title"
					label="Название"
					placeholder="Введите цвет"
					value={current?.title ?? ''}
					required
				/>
				<Select
					name="stockItemId"
					label="Комплектующее"
					placeholder="Выберите позицию"
					options={stockChoices}
					value={String(current?.stockItemId ?? '')}
				/>
				<div class="flex items-end gap-2">
					<Button type="submit">{current ? 'Сохранить' : 'Добавить'}</Button>
				</div>
			</form>
		{/key}
	{/snippet}
</Modal>
