<script lang="ts">
	import SectionTabs from '$lib/crm/SectionTabs.svelte';
	import { CATALOG_TABS } from '$lib/crm/sections';
	import { enhance } from '$app/forms';
	import { Button, Card, Modal, Input, NumberInput, Select, withToast } from '$lib/ui';
	import type { CrmCategoryDto } from '$lib/types/crm-catalog';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	// null: closed; 'new': a new category; a category: the edit of that one.
	let editing = $state<CrmCategoryDto | 'new' | null>(null);
	const current = $derived(editing === 'new' ? null : editing);
	const parents = $derived([
		{ value: '', label: 'Корневая категория' },
		...data.categories
			.filter((row) => row.id !== current?.id)
			.map((row) => ({ value: String(row.id), label: row.title }))
	]);
</script>

<svelte:head><title>Категории каталога</title></svelte:head>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
	<SectionTabs tabs={CATALOG_TABS} label="Каталог" />
	<div class="flex flex-wrap items-end gap-4">
		<div>
			<h1 class="mb-2 text-3xl">Категории</h1>
			<p class="max-w-2xl text-fg-muted">
				Разделы каталога, по которым контрагент выбирает модель.
			</p>
		</div>
		<Button class="sm:ml-auto" onclick={() => (editing = 'new')}>Добавить категорию</Button>
	</div>
	<Card.Root>
		<Card.Content>
			{#if data.categories.length === 0}<p class="text-fg-muted">Категорий пока нет.</p>{/if}
			<ul class="divide-y divide-border">
				{#each data.categories as category (category.id)}
					<li class="flex flex-wrap items-center gap-3 py-3">
						<div class="min-w-40 flex-1">
							<strong>{category.title}</strong>
							<p class="text-sm text-fg-muted">
								{data.categories.find((row) => row.id === category.parentId)?.title ?? 'Корень'} · порядок
								{category.sortOrder}
							</p>
						</div>
						<Button variant="secondary" size="sm" onclick={() => (editing = category)}
							>Изменить</Button
						>
						<form
							method="POST"
							action="?/delete"
							use:enhance={withToast({ success: 'Категория удалена' })}
						>
							<input type="hidden" name="id" value={category.id} /><Button
								type="submit"
								variant="ghost"
								class="text-danger"
								size="sm">Удалить</Button
							>
						</form>
					</li>
				{/each}
			</ul>
		</Card.Content>
	</Card.Root>
</div>

<Modal
	open={editing !== null}
	title={current ? 'Изменить категорию' : 'Новая категория'}
	onClose={() => (editing = null)}
>
	{#snippet body()}
		{#key current?.id}
			<form
				method="POST"
				action={current ? '?/update' : '?/create'}
				class="grid gap-4"
				use:enhance={withToast({
					success: current ? 'Категория сохранена' : 'Категория добавлена',
					onSuccess: () => (editing = null)
				})}
			>
				{#if current}<input type="hidden" name="id" value={current.id} />{/if}
				<Input
					name="title"
					label="Название"
					placeholder="Введите название"
					value={current?.title ?? ''}
					required
				/>
				<Select
					name="parentId"
					label="Родитель"
					placeholder="Выберите родителя"
					options={parents}
					value={String(current?.parentId ?? '')}
				/>
				<NumberInput
					name="sortOrder"
					label="Порядок"
					placeholder="Введите число"
					value={current?.sortOrder ?? 0}
					min={0}
				/>
				<div class="flex items-end gap-2">
					<Button type="submit">{current ? 'Сохранить' : 'Добавить'}</Button>
				</div>
			</form>
		{/key}
	{/snippet}
</Modal>
