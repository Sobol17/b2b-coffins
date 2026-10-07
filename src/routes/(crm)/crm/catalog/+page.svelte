<script lang="ts">
	import EntityList from '$lib/crm/EntityList.svelte';
	import SectionTabs from '$lib/crm/SectionTabs.svelte';
	import { CATALOG_TABS } from '$lib/crm/sections';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import {
		Button,
		Card,
		Input,
		NumberInput,
		Modal,
		Select,
		TONE_CLASS,
		buttonVariants,
		withToast
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
	let createOpen = $state(false);
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
	<SectionTabs tabs={CATALOG_TABS} label="Каталог" />
	<div class="flex flex-wrap items-end gap-4">
		<div>
			<h1 class="mb-2 text-3xl">Каталог</h1>
			<p class="max-w-2xl text-fg-muted">Модели и варианты, которые публикуются в портале.</p>
		</div>
		<Button class="sm:ml-auto" onclick={() => (createOpen = true)}>Добавить модель</Button>
	</div>
	<Card.Root
		><Card.Content class="flex flex-col gap-4">
			<div class="flex flex-wrap items-end gap-2">
				<div class="min-w-60 flex-1">
					<Input label="Поиск" placeholder="Введите артикул или модель" bind:value={search} />
				</div>
				<Button variant="secondary" onclick={searchNow}>Найти</Button>
			</div>
			<EntityList
				rows={data.products.rows}
				paging={{ total: data.products.total, query, onQueryChange: changeQuery }}
				emptyTitle="Моделей пока нет"
			>
				{#snippet item(row: CrmProductListItemDto)}
					<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
						<a class="font-medium text-link" href={resolve(`/crm/catalog/${row.id}`)}>{row.title}</a
						>
						<span
							class={[
								'inline-flex rounded-pill px-2.5 py-0.5 text-xs',
								TONE_CLASS[row.isDeleted ? 'danger' : row.isPublished ? 'success' : 'neutral']
							]}
						>
							{row.isDeleted ? 'Удалена' : row.isPublished ? 'Опубликована' : 'Скрыта'}
						</span>
					</div>
					<div class="text-xs text-fg-faint">
						<code class="font-mono">{row.sku}</code> · вариантов: {row.variantCount}
					</div>
				{/snippet}
				{#snippet actions(row: CrmProductListItemDto)}
					<a
						class={buttonVariants({ variant: 'secondary', size: 'sm' })}
						href={resolve(`/crm/catalog/${row.id}`)}
					>
						Открыть
					</a>
				{/snippet}
			</EntityList>
		</Card.Content></Card.Root
	>
</div>

<Modal bind:open={createOpen} title="Новая модель">
	{#snippet body()}
		{#if categories.length === 0}
			<p class="mb-4 text-fg-muted">Сначала добавьте категорию.</p>
		{/if}
		<form
			method="POST"
			action="?/create"
			class="grid gap-4"
			use:enhance={withToast({
				success: 'Модель добавлена',
				onSuccess: () => (createOpen = false)
			})}
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
			<NumberInput name="sortOrder" label="Порядок" placeholder="Введите число" value={0} min={0} />
			<Input name="description" label="Описание" placeholder="Введите описание" />
			<div class="flex items-end">
				<Button type="submit" disabled={categories.length === 0}>Добавить модель</Button>
			</div>
		</form>
	{/snippet}
</Modal>
