<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Card, Input, NumberInput, Select, withToast } from '$lib/ui';
	import type { CrmCategoryDto, CrmProductDto } from '$lib/types/crm-catalog';

	let { product, categories }: { product: CrmProductDto; categories: readonly CrmCategoryDto[] } =
		$props();
	const choices = $derived(categories.map((row) => ({ value: String(row.id), label: row.title })));
</script>

<Card.Root
	><Card.Content class="flex flex-col gap-4">
		<h2 class="text-2xl">Модель</h2>
		<form
			method="POST"
			action="?/update"
			class="grid gap-4 sm:grid-cols-2"
			use:enhance={withToast({ success: 'Модель сохранена' })}
		>
			<input type="hidden" name="isPublished" value={String(product.isPublished)} />
			<Input
				name="sku"
				label="Артикул"
				placeholder="Введите артикул"
				value={product.sku}
				required
			/>
			<Input
				name="title"
				label="Название"
				placeholder="Введите название"
				value={product.title}
				required
			/>
			<Select
				name="categoryId"
				label="Категория"
				placeholder="Выберите категорию"
				options={choices}
				value={String(product.categoryId ?? '')}
				required
			/>
			<NumberInput
				name="sortOrder"
				label="Порядок"
				placeholder="Введите число"
				value={product.sortOrder}
				min={0}
			/>
			<div class="sm:col-span-2">
				<Input
					name="description"
					label="Описание"
					placeholder="Введите описание"
					value={product.description ?? ''}
				/>
			</div>
			<Button type="submit" class="self-start" disabled={product.isDeleted}>Сохранить</Button>
		</form>
		<div class="flex flex-wrap items-center gap-3 border-t border-border pt-4">
			<span class="text-sm text-fg-muted"
				>{product.isDeleted
					? 'Удалена'
					: product.isPublished
						? 'Опубликована в портале'
						: 'Скрыта в портале'}</span
			>
			{#if !product.isDeleted}
				<form
					method="POST"
					action="?/publish"
					use:enhance={withToast({
						success: product.isPublished ? 'Модель скрыта' : 'Модель опубликована'
					})}
				>
					<input type="hidden" name="isPublished" value={String(!product.isPublished)} />
					<Button type="submit" variant="secondary"
						>{product.isPublished ? 'Скрыть' : 'Опубликовать'}</Button
					>
				</form>
				<form
					method="POST"
					action="?/delete"
					use:enhance={withToast({ success: 'Модель удалена' })}
				>
					<Button type="submit" variant="danger">Удалить</Button>
				</form>
			{/if}
		</div>
	</Card.Content></Card.Root
>
