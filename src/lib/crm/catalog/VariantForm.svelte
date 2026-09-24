<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Input, MoneyInput, NumberInput, Select, withToast } from '$lib/ui';
	import type { CrmCatalogChoicesDto, CrmVariantDto } from '$lib/types/crm-catalog';

	let {
		variant,
		choices,
		canSeeCost,
		onDone
	}: {
		variant: CrmVariantDto | null;
		choices: CrmCatalogChoicesDto;
		canSeeCost: boolean;
		onDone: () => void;
	} = $props();
	const materials = $derived(
		choices.materials.map((row) => ({ value: String(row.id), label: row.title }))
	);
	const stock = $derived([
		{ value: '', label: 'Без учётной позиции' },
		...choices.stockProducts.map((row) => ({
			value: String(row.id),
			label: `${row.code} · ${row.title}`
		}))
	]);
</script>

<form
	method="POST"
	action={variant ? '?/updateVariant' : '?/createVariant'}
	class="grid gap-4 sm:grid-cols-2"
	use:enhance={withToast({
		success: variant ? 'Вариант сохранён' : 'Вариант добавлен',
		onSuccess: onDone
	})}
>
	{#if variant}<input type="hidden" name="id" value={variant.id} />{/if}
	<input type="hidden" name="isPublished" value={String(variant?.isPublished ?? false)} />
	<Input
		name="sku"
		label="Артикул варианта"
		placeholder="Введите артикул"
		value={variant?.sku ?? ''}
		required
	/>
	<Input
		name="sizeCode"
		label="Размер"
		placeholder="Введите размер"
		value={variant?.sizeCode ?? ''}
		required
	/>
	<Select
		name="materialId"
		label="Материал"
		placeholder="Выберите материал"
		options={materials}
		value={String(variant?.materialId ?? '')}
		required
	/>
	<Select
		name="stockItemId"
		label="Учётная позиция изделия"
		placeholder="Выберите позицию"
		options={stock}
		value={String(variant?.stockItemId ?? '')}
	/>
	<NumberInput
		name="lengthMm"
		label="Длина, мм"
		placeholder="Введите длину"
		value={variant?.lengthMm ?? 0}
		min={0}
	/>
	<NumberInput
		name="widthMm"
		label="Ширина, мм"
		placeholder="Введите ширину"
		value={variant?.widthMm ?? 0}
		min={0}
	/>
	<NumberInput
		name="heightMm"
		label="Высота, мм"
		placeholder="Введите высоту"
		value={variant?.heightMm ?? 0}
		min={0}
	/>
	<NumberInput
		name="weightG"
		label="Вес, г"
		placeholder="Введите вес"
		value={variant?.weightG ?? 0}
		min={0}
	/>
	<MoneyInput
		name="basePriceMinor"
		label="Базовая цена"
		placeholder="Введите цену"
		valueMinor={variant?.basePriceMinor ?? 0}
	/>
	{#if canSeeCost}<MoneyInput
			name="costPriceMinor"
			label="Себестоимость"
			placeholder="Введите себестоимость"
			valueMinor={variant?.costPriceMinor ?? 0}
		/>{/if}
	<div class="flex items-end gap-2">
		<Button type="submit">{variant ? 'Сохранить вариант' : 'Добавить вариант'}</Button>
		<Button variant="secondary" onclick={onDone}>Отмена</Button>
	</div>
</form>
