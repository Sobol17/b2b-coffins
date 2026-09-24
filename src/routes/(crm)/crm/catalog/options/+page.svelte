<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { Button, Card, Input, Select, withToast } from '$lib/ui';
	import type { CrmOptionDto } from '$lib/types/crm-catalog';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let editing = $state<CrmOptionDto | null>(null);
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
	<div>
		<a href={resolve('/crm/catalog')} class="text-sm text-link">← Каталог</a>
		<h1 class="mt-2 text-3xl">Цвета</h1>
	</div>
	<Card.Root
		><Card.Content class="flex flex-col gap-4">
			<h2 class="text-2xl">{editing ? 'Изменить цвет' : 'Новый цвет'}</h2>
			{#key editing?.id}
				<form
					method="POST"
					action={editing ? '?/update' : '?/create'}
					class="grid gap-4 sm:grid-cols-2"
					use:enhance={withToast({
						success: editing ? 'Цвет сохранён' : 'Цвет добавлен',
						onSuccess: () => (editing = null)
					})}
				>
					{#if editing}<input type="hidden" name="id" value={editing.id} />{/if}
					<input type="hidden" name="priceDeltaMinor" value="0" />
					<input type="hidden" name="isActive" value={String(editing?.isActive ?? true)} />
					<Input
						name="title"
						label="Название"
						placeholder="Введите цвет"
						value={editing?.title ?? ''}
						required
					/>
					<Select
						name="stockItemId"
						label="Комплектующее"
						placeholder="Выберите позицию"
						options={stockChoices}
						value={String(editing?.stockItemId ?? '')}
					/>
					<div class="flex items-end gap-2">
						<Button type="submit">{editing ? 'Сохранить' : 'Добавить'}</Button>
						{#if editing}<Button variant="secondary" onclick={() => (editing = null)}>Отмена</Button
							>{/if}
					</div>
				</form>
			{/key}
		</Card.Content></Card.Root
	>
	<Card.Root
		><Card.Content>
			<h2 class="mb-4 text-2xl">Все цвета</h2>
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
							<Button type="submit" size="sm" variant={option.isActive ? 'danger' : 'secondary'}
								>{option.isActive ? 'Выключить' : 'Включить'}</Button
							>
						</form>
					</li>
				{/each}
			</ul>
		</Card.Content></Card.Root
	>
</div>
