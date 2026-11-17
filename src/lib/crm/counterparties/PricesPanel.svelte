<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		Button,
		Card,
		ConfirmDialog,
		DataTable,
		ErrorState,
		FilterBar,
		FileInput,
		buttonVariants,
		MoneyInput,
		PriceCell,
		withToast,
		type DataTableColumn,
		type FilterField,
		type ToastSpec
	} from '$lib/ui';
	import type { CounterpartyPriceRowDto } from '$lib/types/crm-counterparty';
	import type { ListQuery, Page } from '$lib/types/list';
	import { filtersOf, withListQuery } from '$lib/utils/list-url';
	import PriceListAttachment from './PriceListAttachment.svelte';

	/*
	 * «Цены» tab of the counterparty card: one price per model for this counterparty.
	 * An empty field means it pays the «Базовая» column, the regional price when the card has a
	 * region (v1.64). The page saves only what changed.
	 */
	let {
		counterpartyId,
		prices,
		categories,
		regionPriceListId,
		priceLists,
		attachmentError,
		formError
	}: {
		counterpartyId: number;
		prices: Page<CounterpartyPriceRowDto>;
		categories: readonly { readonly id: number; readonly title: string }[];
		regionPriceListId: number | null;
		priceLists: readonly { readonly id: number; readonly title: string }[];
		attachmentError: string | undefined;
		formError: string | undefined;
	} = $props();

	let refillForm = $state<HTMLFormElement>();
	let refillOpen = $state(false);

	const PREFIX = 'price';

	const fields = $derived<FilterField[]>([
		{
			key: 'priceSearch',
			label: 'Поиск',
			type: 'text',
			placeholder: 'Введите название или артикул'
		},
		{
			key: 'priceCategory',
			label: 'Раздел',
			type: 'select',
			placeholder: 'Выберите раздел',
			options: [
				{ value: '', label: 'Все разделы' },
				...categories.map((row) => ({ value: String(row.id), label: row.title }))
			]
		}
	]);

	let filters = $state(filtersOf(page.url, ['priceSearch', 'priceCategory']));
	let saving = $state(false);
	let importing = $state(false);

	const columns: DataTableColumn[] = [
		{ key: 'productTitle', label: 'Модель' },
		{ key: 'base', label: 'Базовая, ₽', align: 'end' },
		{ key: 'personal', label: 'Для контрагента, ₽', align: 'end' }
	];

	const rows = $derived(prices.rows.map((row) => ({ ...row, id: row.productId })));
	const query = $derived<ListQuery>({ page: prices.page, perPage: prices.perPage });

	function changeQuery(next: ListQuery): void {
		// Same page with a rewritten query string, so there is no route pattern to resolve.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(withListQuery(page.url, next, PREFIX), { keepFocus: true, noScroll: true });
	}

	function savedToast(data: Record<string, unknown> | undefined): ToastSpec {
		const saved = data?.['saved'];
		const { updated = 0, cleared = 0 } =
			typeof saved === 'object' && saved !== null
				? (saved as { updated?: number; cleared?: number })
				: {};
		return { title: 'Цены сохранены', description: `Задано: ${updated}. Очищено: ${cleared}.` };
	}
</script>

<div class="flex min-w-0 flex-col gap-6">
	<PriceListAttachment {regionPriceListId} {priceLists} formError={attachmentError} />
	<Card.Root>
		<Card.Header>
			<Card.Title>Цены для контрагента</Card.Title>
			<Card.Description>
				«Базовая» показывает цену регионального прайса, без него цену базового прайса. Цена для
				контрагента заменяет базовую, пустое поле возвращает базовую. Скидка по договору применяется
				к сумме заявки поверх этих цен.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<a
					class={buttonVariants({ variant: 'secondary' })}
					href={resolve(`/crm/counterparties/${counterpartyId}/prices.xlsx`)}
					download
					data-sveltekit-reload>Скачать Excel</a
				>
				{#if regionPriceListId !== null}
					<Button variant="secondary" onclick={() => (refillOpen = true)}
						>Заполнить из прайса</Button
					>
				{/if}
			</div>
			<FilterBar {fields} bind:filters pageKey="pricePage" />
			{#if formError}
				<div data-testid="prices-error"><ErrorState title={formError} /></div>
			{/if}
			<form
				method="POST"
				action="?/prices"
				use:enhance={withToast({
					reset: false,
					pending: (value) => (saving = value),
					success: savedToast
				})}
			>
				<DataTable
					{columns}
					{rows}
					total={prices.total}
					{query}
					onQueryChange={changeQuery}
					emptyTitle="Позиций не найдено"
				>
					{#snippet cell(row: CounterpartyPriceRowDto & { id: number }, column: DataTableColumn)}
						{#if column.key === 'productTitle'}
							<div>{row.productTitle}</div>
							<div class="text-xs text-fg-faint">
								{row.sku}{row.categoryTitle ? ` · ${row.categoryTitle}` : ''}
							</div>
						{:else if column.key === 'base'}
							<PriceCell valueMinor={row.basePriceMinor} class="text-fg-muted" />
						{:else if column.key === 'personal'}
							{#key row.personalPriceMinor}
								<div class="ml-auto w-36" data-testid="personal-price-input">
									<MoneyInput
										name={`price:${row.productId}`}
										valueMinor={row.personalPriceMinor ?? 0}
										label=""
										placeholder="Введите цену"
										blankZero
									/>
								</div>
							{/key}
						{/if}
					{/snippet}
				</DataTable>
				{#if prices.total > 0}
					<div class="flex justify-end pt-4">
						<Button type="submit" loading={saving}>Сохранить цены</Button>
					</div>
				{/if}
			</form>
			<form
				method="POST"
				action="?/priceImport"
				enctype="multipart/form-data"
				class="flex flex-col gap-4 border-t border-border pt-4"
				use:enhance={withToast({
					pending: (value) => (importing = value),
					success: 'Прайс контрагента загружен'
				})}
			>
				<FileInput
					name="file"
					accept=".xlsx"
					label="Загрузить прайс Excel"
					hint="Артикул модели и цена. Файл заменит личные цены этого контрагента."
					required
				/>
				<Button type="submit" class="self-start" loading={importing}>Загрузить Excel</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<form
		bind:this={refillForm}
		method="POST"
		action="?/refill"
		class="hidden"
		use:enhance={withToast({ success: 'Цены заполнены из регионального прайса' })}
	></form>
	<ConfirmDialog
		bind:open={refillOpen}
		title="Заполнить цены из прайса?"
		description="Цены контрагента заменятся ценами регионального прайса. Индивидуальные цены пропадут."
		confirmLabel="Заполнить"
		danger
		onConfirm={() => {
			refillForm?.requestSubmit();
			refillOpen = false;
		}}
	/>
</div>
