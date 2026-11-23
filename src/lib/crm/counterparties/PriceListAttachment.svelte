<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Card, Combobox, ErrorState, withToast } from '$lib/ui';

	let {
		regionPriceListId,
		priceLists,
		formError
	}: {
		regionPriceListId: number | null;
		priceLists: readonly { readonly id: number; readonly title: string }[];
		formError?: string | undefined;
	} = $props();
	let saving = $state(false);
	const options = $derived([
		{ value: '', label: 'Без прайса' },
		...priceLists.map((list) => ({ value: String(list.id), label: list.title }))
	]);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Привязка прайса</Card.Title>
		<Card.Description>
			Личные цены сохраняются при смене и снятии привязки. Если личного прайса ещё нет, выбранный
			регион заполнит его. Без привязки базовая цена берётся из общего прайса или цены модели.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<form
			method="POST"
			action="?/priceList"
			class="flex min-w-0 flex-col gap-4"
			use:enhance={withToast({
				reset: false,
				pending: (value) => (saving = value),
				success: 'Привязка прайса сохранена'
			})}
		>
			<div class="grid min-w-0 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
				<Combobox
					name="regionPriceListId"
					label="Региональный прайс-лист"
					placeholder="Выберите прайс-лист"
					{options}
					value={regionPriceListId === null ? '' : String(regionPriceListId)}
					disabled={saving}
				/>
				<Button type="submit" class="self-end" loading={saving}>Сохранить привязку</Button>
			</div>
			{#if formError}<div data-testid="price-list-error"><ErrorState title={formError} /></div>{/if}
		</form>
	</Card.Content>
</Card.Root>
