<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { Button, Card, Input, NumberInput, Select, withToast } from '$lib/ui';
	import type { CrmCategoryDto } from '$lib/types/crm-catalog';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let editing = $state<CrmCategoryDto | null>(null);
	const parents = $derived([
		{ value: '', label: 'Корневая категория' },
		...data.categories
			.filter((row) => row.id !== editing?.id)
			.map((row) => ({ value: String(row.id), label: row.title }))
	]);
</script>

<svelte:head><title>Категории каталога</title></svelte:head>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
	<div>
		<a href={resolve('/crm/catalog')} class="text-sm text-link">← Каталог</a>
		<h1 class="mt-2 text-3xl">Категории</h1>
	</div>
	<Card.Root>
		<Card.Content class="flex flex-col gap-4">
			<h2 class="text-2xl">{editing ? 'Изменить категорию' : 'Новая категория'}</h2>
			{#key editing?.id}
				<form
					method="POST"
					action={editing ? '?/update' : '?/create'}
					class="grid gap-4 sm:grid-cols-2"
					use:enhance={withToast({
						success: editing ? 'Категория сохранена' : 'Категория добавлена',
						onSuccess: () => (editing = null)
					})}
				>
					{#if editing}<input type="hidden" name="id" value={editing.id} />{/if}
					<Input
						name="title"
						label="Название"
						placeholder="Введите название"
						value={editing?.title ?? ''}
						required
					/>
					<Select
						name="parentId"
						label="Родитель"
						placeholder="Выберите родителя"
						options={parents}
						value={String(editing?.parentId ?? '')}
					/>
					<NumberInput
						name="sortOrder"
						label="Порядок"
						placeholder="Введите число"
						value={editing?.sortOrder ?? 0}
						min={0}
					/>
					<div class="flex items-end gap-2">
						<Button type="submit">{editing ? 'Сохранить' : 'Добавить'}</Button>
						{#if editing}<Button variant="secondary" onclick={() => (editing = null)}>Отмена</Button
							>{/if}
					</div>
				</form>
			{/key}
		</Card.Content>
	</Card.Root>
	<Card.Root>
		<Card.Content>
			<h2 class="mb-4 text-2xl">Разделы каталога</h2>
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
								variant="danger"
								size="sm">Удалить</Button
							>
						</form>
					</li>
				{/each}
			</ul>
		</Card.Content>
	</Card.Root>
</div>
