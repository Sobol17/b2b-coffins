<script lang="ts">
	import { Input, NumberInput, Select } from '$lib/ui';
	import { STOCK_MOVE_MAX, type StockChoicesDto, type StockRowDto } from '$lib/types/crm-stock';

	/** The fields a new item and an edit share; the kind is chosen once, on creation. */
	let {
		choices,
		values
	}: {
		choices: StockChoicesDto;
		values?: Pick<StockRowDto, 'code' | 'title' | 'unitId' | 'minThreshold'> | undefined;
	} = $props();

	const units = $derived(
		choices.units.map((unit) => ({ value: String(unit.id), label: unit.title }))
	);
	let unitId = $derived(values ? String(values.unitId) : '');
</script>

<Input
	name="code"
	label="Код"
	placeholder="Введите код"
	value={values?.code ?? ''}
	maxlength={40}
	required
/>
<Input
	name="title"
	label="Название"
	placeholder="Введите название"
	value={values?.title ?? ''}
	maxlength={160}
	required
/>
<Select
	name="unitId"
	label="Единица"
	options={units}
	placeholder="Выберите единицу"
	required
	bind:value={unitId}
/>
<NumberInput
	name="minThreshold"
	label="Минимальный порог"
	placeholder="Введите порог"
	hint="Ноль выключает сигнал"
	value={values?.minThreshold ?? 0}
	min={0}
	max={STOCK_MOVE_MAX}
/>
