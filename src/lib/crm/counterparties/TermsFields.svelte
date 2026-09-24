<script lang="ts">
	import { SCHEME_OPTIONS } from '$lib/crm/labels';
	import { NumberInput, Select } from '$lib/ui';
	import type { SettlementScheme } from '$lib/types/counterparty';
	import type { CrmCounterpartyChoicesDto } from '$lib/types/crm-counterparty';

	/** Commercial terms. The staff limit shows on the card only: a new counterparty takes the default. */
	let {
		choices,
		values,
		withStaffLimit = false
	}: {
		choices: CrmCounterpartyChoicesDto;
		values?: {
			priceListId: number | null;
			discountPercent: number;
			settlementScheme: SettlementScheme;
			managerId: number | null;
			staffLimit: number;
		};
		withStaffLimit?: boolean;
	} = $props();

	const managers = $derived([
		{ value: '', label: 'Не назначен' },
		...choices.managers.map((row) => ({ value: String(row.id), label: row.fullName }))
	]);
	const priceLists = $derived([
		{ value: '', label: 'Базовые цены' },
		...choices.priceLists.map((row) => ({ value: String(row.id), label: row.title }))
	]);
</script>

<Select
	name="managerId"
	label="Ответственный администратор"
	placeholder="Выберите администратора"
	options={managers}
	value={String(values?.managerId ?? '')}
/>
<Select
	name="priceListId"
	label="Прайс-лист"
	placeholder="Выберите прайс-лист"
	options={priceLists}
	value={String(values?.priceListId ?? '')}
/>
<Select
	name="settlementScheme"
	label="Схема расчётов"
	placeholder="Выберите схему"
	options={SCHEME_OPTIONS}
	value={values?.settlementScheme ?? 'on_fact'}
	required
/>
<NumberInput
	name="discountPercent"
	label="Скидка по договору, %"
	placeholder="Введите процент"
	value={values?.discountPercent ?? 0}
	min={0}
	max={100}
/>
{#if withStaffLimit}
	<NumberInput
		name="staffLimit"
		label="Лимит сотрудников"
		placeholder="Введите число"
		value={values?.staffLimit ?? 10}
		min={1}
		max={1000}
	/>
{/if}
