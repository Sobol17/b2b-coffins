<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, DatePicker, NumberInput, Select, withToast } from '$lib/ui';
	import type {
		CrmCategoryDto,
		CrmDiscountRuleDto,
		CrmPricingChoicesDto
	} from '$lib/types/crm-catalog';

	let {
		rule,
		categories,
		choices,
		onDone
	}: {
		rule: CrmDiscountRuleDto | null;
		categories: readonly CrmCategoryDto[];
		choices: CrmPricingChoicesDto;
		onDone: () => void;
	} = $props();
	const counterparties = $derived([
		{ value: '', label: 'Все контрагенты' },
		...choices.counterparties.map((row) => ({ value: String(row.id), label: row.name }))
	]);
	const categoryChoices = $derived([
		{ value: '', label: 'Все категории' },
		...categories.map((row) => ({ value: String(row.id), label: row.title }))
	]);
</script>

<form
	method="POST"
	action={rule ? '?/updateRule' : '?/createRule'}
	class="grid gap-4 sm:grid-cols-2"
	use:enhance={withToast({
		success: rule ? 'Правило сохранено' : 'Правило добавлено',
		onSuccess: onDone
	})}
>
	{#if rule}<input type="hidden" name="id" value={rule.id} />{/if}
	<Select
		name="counterpartyId"
		label="Контрагент"
		placeholder="Выберите контрагента"
		options={counterparties}
		value={String(rule?.counterpartyId ?? '')}
	/>
	<Select
		name="categoryId"
		label="Категория"
		placeholder="Выберите категорию"
		options={categoryChoices}
		value={String(rule?.categoryId ?? '')}
	/>
	<NumberInput
		name="percent"
		label="Скидка, %"
		placeholder="Введите процент"
		value={rule?.percent ?? 1}
		min={1}
		max={100}
	/>
	<div></div>
	<DatePicker name="validFrom" label="Начало действия" value={rule?.validFrom ?? ''} />
	<DatePicker name="validTo" label="Конец действия" value={rule?.validTo ?? ''} />
	<div class="flex items-end gap-2">
		<Button type="submit">{rule ? 'Сохранить' : 'Добавить правило'}</Button>
		{#if rule}<Button variant="secondary" onclick={onDone}>Отмена</Button>{/if}
	</div>
</form>
