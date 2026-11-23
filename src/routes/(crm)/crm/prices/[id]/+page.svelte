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
		MoneyInput,
		Combobox,
		buttonVariants,
		withToast
	} from '$lib/ui';
	import PriceSheetImportForm from '$lib/crm/catalog/PriceSheetImportForm.svelte';
	import { formatMinor } from '$lib/utils/format';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const models = $derived(
		data.models.map((row) => ({
			value: String(row.id),
			label: `${row.productTitle} · ${row.sku}`
		}))
	);
	let createOpen = $state(false);
	let creating = $state(false);
	let selectedProductId = $state('');
	const pricedProductIds = $derived(new Set(data.list.items.map((item) => String(item.productId))));
	const availableModels = $derived(models.filter((model) => !pricedProductIds.has(model.value)));
	const allModelsPriced = $derived(models.length > 0 && availableModels.length === 0);
	const modelById = $derived(new Map(data.models.map((row) => [row.id, row])));
	const rows = $derived(
		data.list.items.map((item) => ({
			...item,
			id: item.productId,
			title: modelById.get(item.productId)?.productTitle ?? 'Изделие удалено из каталога',
			sku: modelById.get(item.productId)?.sku ?? `#${item.productId}`
		}))
	);
	let editing = $state<(typeof rows)[number] | null>(null);
	let deleting = $state<(typeof rows)[number] | null>(null);
	let deleteOpen = $state(false);
	let deleteForm: HTMLFormElement;
	let saving = $state(false);
</script>

<svelte:head><title>{data.list.title} · CRM</title></svelte:head>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
	<Breadcrumbs
		items={[{ label: 'Прайсы и скидки', href: resolve('/crm/prices') }, { label: data.list.title }]}
	/>
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-3xl">{data.list.title}</h1>
		<a
			class={buttonVariants({ variant: 'secondary' })}
			href={resolve(`/crm/prices/${data.list.id}/export.xlsx`)}
			download
			data-sveltekit-reload>Скачать Excel</a
		>
	</div>
	<Card.Root
		><Card.Content>
			<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
				<h2 class="text-2xl">Позиции прайс-листа</h2>
				<div
					class="ml-auto flex flex-col items-end gap-1 sm:flex-row-reverse sm:items-center sm:gap-3"
				>
					<Button
						disabled={availableModels.length === 0}
						aria-describedby={allModelsPriced ? 'price-list-add-hint' : undefined}
						onclick={() => {
							selectedProductId = '';
							createOpen = true;
						}}><Plus aria-hidden="true" />Добавить</Button
					>
					{#if allModelsPriced}
						<p id="price-list-add-hint" class="text-right text-sm text-fg-muted">
							Все модели уже есть в этом прайсе.
						</p>
					{/if}
				</div>
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

	<PriceSheetImportForm />
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
				<input type="hidden" name="productId" value={editing.productId} />
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
	<input type="hidden" name="id" value={deleting?.productId ?? ''} />
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
			class="flex flex-col gap-6"
			use:enhance={withToast({
				pending: (value) => (creating = value),
				success: 'Цена сохранена',
				onSuccess: () => (createOpen = false)
			})}
		>
			<Combobox
				name="productId"
				label="Изделие"
				placeholder="Выберите изделие"
				options={availableModels}
				bind:value={selectedProductId}
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
				<Button type="submit" loading={creating} disabled={!selectedProductId}>Добавить</Button>
			</div>
		</form>
	{/snippet}
</Modal>
