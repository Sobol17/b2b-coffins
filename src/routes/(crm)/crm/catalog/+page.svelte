<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import {
		Button,
		Card,
		DataTable,
		Input,
		NumberInput,
		Select,
		withToast,
		type DataTableColumn
	} from '$lib/ui';
	import type { CrmProductListItemDto } from '$lib/types/crm-catalog';
	import type { ListQuery } from '$lib/types/list';
	import { listQueryOf, withListQuery } from '$lib/utils/list-url';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let search = $state(page.url.searchParams.get('search') ?? '');
	const query = $derived(listQueryOf(page.url, data.products));
	const categories = $derived(
		data.categories.map((row) => ({ value: String(row.id), label: row.title }))
	);
	const columns: DataTableColumn[] = [
		{ key: 'sku', label: 'Артикул', sortable: true },
		{ key: 'title', label: 'Модель', sortable: true },
		{ key: 'variantCount', label: 'Вариантов' },
		{ key: 'isPublished', label: 'Статус' },
		{ key: 'actions', label: 'Действия', align: 'end' }
	];
	function changeQuery(next: ListQuery): void {
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(withListQuery(page.url, next), { keepFocus: true, noScroll: true });
	}
	function searchNow(): void {
		const next = new URL(page.url);
		if (search.trim()) next.searchParams.set('search', search.trim());
		else next.searchParams.delete('search');
		next.searchParams.delete('page');
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(next);
	}
</script>

<svelte:head><title>Каталог CRM</title></svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
	<div class="flex flex-wrap items-end gap-3">
		<div class="flex-1">
			<h1 class="text-3xl">Каталог</h1>
			<p class="mt-2 text-fg-muted">Модели и варианты, которые публикуются в портале.</p>
		</div>
		<a href={resolve('/crm/catalog/categories')} class="text-link">Категории</a>
		<a href={resolve('/crm/catalog/options')} class="text-link">Цвета</a>
		<a href={resolve('/crm/prices')} class="text-link">Прайсы и скидки</a>
	</div>
	<Card.Root
		><Card.Content class="flex flex-col gap-4">
			<h2 class="text-2xl">Новая модель</h2>
			{#if categories.length === 0}<p class="text-fg-muted">Сначала добавьте категорию.</p>{/if}
			<form
				method="POST"
				action="?/create"
				class="grid gap-4 sm:grid-cols-2"
				use:enhance={withToast({ success: 'Модель добавлена' })}
			>
				<input type="hidden" name="isPublished" value="false" />
				<Input name="sku" label="Артикул" placeholder="Введите артикул" required />
				<Input name="title" label="Название" placeholder="Введите название" required />
				<Select
					name="categoryId"
					label="Категория"
					placeholder="Выберите категорию"
					options={categories}
					required
				/>
				<NumberInput
					name="sortOrder"
					label="Порядок"
					placeholder="Введите число"
					value={0}
					min={0}
				/>
				<Input name="description" label="Описание" placeholder="Введите описание" />
				<div class="flex items-end">
					<Button type="submit" disabled={categories.length === 0}>Добавить модель</Button>
				</div>
			</form>
		</Card.Content></Card.Root
	>
	<Card.Root
		><Card.Content class="flex flex-col gap-4">
			<div class="flex flex-wrap items-end gap-2">
				<div class="min-w-60 flex-1">
					<Input label="Поиск" placeholder="Введите артикул или модель" bind:value={search} />
				</div>
				<Button variant="secondary" onclick={searchNow}>Найти</Button>
			</div>
			<DataTable
				{columns}
				rows={data.products.rows}
				total={data.products.total}
				{query}
				onQueryChange={changeQuery}
				emptyTitle="Моделей пока нет"
			>
				{#snippet cell(row: CrmProductListItemDto, column: DataTableColumn)}
					{#if column.key === 'sku'}<code>{row.sku}</code>
					{:else if column.key === 'title'}{row.title}
					{:else if column.key === 'variantCount'}{row.variantCount}
					{:else if column.key === 'isPublished'}{row.isDeleted
							? 'Удалена'
							: row.isPublished
								? 'Опубликована'
								: 'Скрыта'}
					{:else if column.key === 'actions'}<a
							class="text-link"
							href={resolve(`/crm/catalog/${row.id}`)}>Открыть</a
						>{/if}
				{/snippet}
			</DataTable>
		</Card.Content></Card.Root
	>
</div>
