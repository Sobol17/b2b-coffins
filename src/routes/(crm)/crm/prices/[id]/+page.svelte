<script lang="ts">
	import { Plus, Pencil, Trash2 } from '@lucide/svelte';
	import * as Tooltip from '$lib/ui/base/tooltip/index.js';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import {
		Breadcrumbs,
		Button,
		Card,
		DataTable,
		Modal,
		ConfirmDialog,
		FileInput,
		MoneyInput,
		Select,
		withToast,
		type ToastSpec
	} from '$lib/ui';
	import { formatMinor } from '$lib/utils/format';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const variants = $derived(
		data.variants.map((row) => ({
			value: String(row.id),
			label: `${row.productTitle} · ${row.sku}`
		}))
	);
	let importing = $state(false);
	let createOpen = $state(false);
	let creating = $state(false);
	const pricedVariantIds = $derived(new Set(data.list.items.map((item) => String(item.variantId))));
	const availableVariants = $derived(
		variants.filter((variant) => !pricedVariantIds.has(variant.value))
	);
	const variantById = $derived(new Map(data.variants.map((row) => [row.id, row])));
	const rows = $derived(
		data.list.items.map((item) => ({
			...item,
			id: item.variantId,
			title: variantById.get(item.variantId)?.productTitle ?? 'Изделие удалено из каталога',
			sku: variantById.get(item.variantId)?.sku ?? `#${item.variantId}`
		}))
	);
	let editing = $state<(typeof rows)[number] | null>(null);
	let deleting = $state<(typeof rows)[number] | null>(null);
	let deleteOpen = $state(false);
	let deleteForm: HTMLFormElement;
	let saving = $state(false);

	function importedToast(data: Record<string, unknown> | undefined): ToastSpec {
		const count = typeof data?.['imported'] === 'number' ? data['imported'] : 0;
		return { title: 'Прайс загружен', description: `Цен в листе: ${count}.` };
	}
</script>

<svelte:head><title>{data.list.title} · CRM</title></svelte:head>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
	<Breadcrumbs
		items={[{ label: 'Прайсы и скидки', href: resolve('/crm/prices') }, { label: data.list.title }]}
	/>
	<h1 class="text-3xl">{data.list.title}</h1>
	<Card.Root
		><Card.Content>
			<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
				<h2 class="text-2xl">Позиции прайс-листа</h2>
				<Button
					class="ml-auto"
					disabled={availableVariants.length === 0}
					onclick={() => (createOpen = true)}><Plus aria-hidden="true" />Добавить</Button
				>
			</div>
			<Tooltip.Provider>
				<DataTable
					columns={[
						{ key: 'title', label: 'Изделие' },
						{ key: 'sku', label: 'Артикул' },
						{ key: 'price', label: 'Цена, ₽', align: 'end' },
						{ key: 'actions', label: 'Действия', align: 'end' }
					]}
					{rows}
					total={rows.length}
					query={{ page: 1, perPage: rows.length || 1 }}
					onQueryChange={() => {}}
					emptyTitle="Цен пока нет"
				>
					{#snippet cell(row, column)}
						{#if column.key === 'title'}
							{row.title}
						{:else if column.key === 'sku'}
							{row.sku}
						{:else if column.key === 'price'}
							{formatMinor(row.priceMinor)}
						{:else}
							<div class="flex justify-end gap-1">
								<Tooltip.Root>
									<Tooltip.Trigger>
										{#snippet child({ props })}
											<Button
												{...props}
												variant="ghost"
												class="size-11 p-0"
												aria-label="Изменить"
												onclick={() => (editing = row)}><Pencil aria-hidden="true" /></Button
											>
										{/snippet}
									</Tooltip.Trigger>
									<Tooltip.Content role="tooltip">Изменить цену</Tooltip.Content>
								</Tooltip.Root>
								<Tooltip.Root>
									<Tooltip.Trigger>
										{#snippet child({ props })}
											<Button
												{...props}
												variant="ghost"
												class="size-11 p-0 text-danger hover:text-danger"
												aria-label="Удалить"
												onclick={() => {
													deleting = row;
													deleteOpen = true;
												}}><Trash2 aria-hidden="true" /></Button
											>
										{/snippet}
									</Tooltip.Trigger>
									<Tooltip.Content role="tooltip">Удалить позицию</Tooltip.Content>
								</Tooltip.Root>
							</div>
						{/if}
					{/snippet}
				</DataTable>
			</Tooltip.Provider>
		</Card.Content></Card.Root
	>

	<Card.Root>
		<Card.Content class="flex flex-col gap-4">
			<h2 class="text-2xl">Загрузить прайс из файла</h2>
			<form
				method="POST"
				action="?/import"
				enctype="multipart/form-data"
				class="flex flex-col gap-4"
				use:enhance={withToast({ pending: (value) => (importing = value), success: importedToast })}
			>
				<FileInput
					name="file"
					accept=".xlsx"
					label="Файл XLSX"
					hint="Первая строка: «Артикул» и «Цена». Файл заменит все цены листа."
					required
				/>
				<Button type="submit" class="self-start" loading={importing}>Загрузить</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>

<Modal
	open={editing !== null}
	title="Изменить цену"
	description={editing ? `${editing.title} · ${editing.sku}` : undefined}
	onClose={() => (editing = null)}
>
	{#snippet body()}
		{#if editing}
			<form
				method="POST"
				action="?/upsert"
				class="flex flex-col gap-4"
				use:enhance={withToast({
					pending: (value) => (saving = value),
					success: 'Цена сохранена',
					onSuccess: () => (editing = null)
				})}
			>
				<input type="hidden" name="variantId" value={editing.variantId} />
				<MoneyInput
					name="priceMinor"
					label="Цена"
					placeholder="Введите цену"
					valueMinor={editing.priceMinor}
					required
				/>
				<div class="flex gap-2">
					<Button type="submit" loading={saving}>Сохранить цену</Button>
					<Button variant="secondary" disabled={saving} onclick={() => (editing = null)}
						>Отмена</Button
					>
				</div>
			</form>
		{/if}
	{/snippet}
</Modal>
<form
	bind:this={deleteForm}
	method="POST"
	action="?/delete"
	use:enhance={withToast({ success: 'Цена удалена' })}
>
	<input type="hidden" name="id" value={deleting?.variantId ?? ''} />
</form>
<ConfirmDialog
	bind:open={deleteOpen}
	title="Удалить позицию прайс-листа?"
	description={deleting
		? `${deleting.title} · ${deleting.sku}. Для контрагентов будет действовать следующая доступная цена.`
		: undefined}
	confirmLabel="Удалить"
	danger
	onConfirm={() => deleteForm.requestSubmit()}
/>

<Modal
	bind:open={createOpen}
	title="Добавить позицию"
	description="Выберите изделие и укажите цену для этого прайс-листа."
>
	{#snippet body()}
		<form
			method="POST"
			action="?/upsert"
			class="flex flex-col gap-4"
			use:enhance={withToast({
				pending: (value) => (creating = value),
				success: 'Цена сохранена',
				onSuccess: () => (createOpen = false)
			})}
		>
			<Select
				name="variantId"
				label="Изделие"
				placeholder="Выберите изделие"
				options={availableVariants}
				required
			/>
			<MoneyInput
				name="priceMinor"
				label="Цена"
				placeholder="Введите цену"
				valueMinor={0}
				required
			/>
			<div class="flex justify-end gap-2">
				<Button variant="secondary" disabled={creating} onclick={() => (createOpen = false)}
					>Отмена</Button
				>
				<Button type="submit" loading={creating}>Добавить</Button>
			</div>
		</form>
	{/snippet}
</Modal>
