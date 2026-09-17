<script lang="ts">
	import {
		Checkbox,
		Combobox,
		DatePicker,
		DateRangePicker,
		FileUpload,
		Input,
		MoneyInput,
		NumberInput,
		RadioGroup,
		Select,
		Switch,
		Textarea,
		type DateRangeValue,
		type SelectOption
	} from '$lib/ui';
	import Showcase from '../Showcase.svelte';

	const materials: SelectOption[] = [
		{ value: 'pine', label: 'Сосна' },
		{ value: 'oak', label: 'Дуб' },
		{ value: 'birch', label: 'Берёза' }
	];

	let text = $state('');
	let comment = $state('');
	let qty = $state(1);
	let priceMinor = $state(1250050);
	let material = $state('pine');
	let finish = $state('');
	let agreed = $state(false);
	let urgent = $state(false);
	let priority = $state('normal');
	let day = $state('');
	let period = $state<DateRangeValue>({ start: '', end: '' });
	let uploaded = $state<number[]>([]);
</script>

<Showcase name="Input">
	<Input
		label="Название"
		hint="Как в договоре"
		placeholder="ООО «Ритуал-Сервис»"
		bind:value={text}
		required
	/>
	<Input label="С ошибкой" error="Поле обязательно" placeholder="Заполните поле" value="" />
</Showcase>

<Showcase name="Textarea">
	<Textarea
		label="Комментарий"
		placeholder="Пожелания к заявке"
		bind:value={comment}
		hint="До 500 символов"
	/>
</Showcase>

<Showcase name="NumberInput">
	<NumberInput label="Количество" placeholder="1" bind:value={qty} min={1} />
</Showcase>

<Showcase name="MoneyInput">
	<MoneyInput
		label="Цена"
		placeholder="0,00"
		bind:valueMinor={priceMinor}
		hint="Рубли, хранение в копейках"
	/>
	<output data-testid="money-minor" class="text-sm text-fg-muted">{priceMinor}</output>
</Showcase>

<Showcase name="Select">
	<Select
		label="Материал"
		placeholder="Выберите материал"
		options={materials}
		bind:value={material}
	/>
</Showcase>

<Showcase name="Combobox">
	<Combobox
		label="Материал"
		placeholder="Найдите материал"
		options={materials}
		bind:value={finish}
	/>
</Showcase>

<Showcase name="Checkbox">
	<Checkbox label="Согласен с условиями" bind:checked={agreed} />
</Showcase>

<Showcase name="Switch">
	<Switch label="Срочная заявка" bind:checked={urgent} />
</Showcase>

<Showcase name="RadioGroup">
	<RadioGroup
		label="Приоритет"
		options={[
			{ value: 'normal', label: 'Обычный' },
			{ value: 'urgent', label: 'Срочный' }
		]}
		bind:value={priority}
	/>
</Showcase>

<Showcase name="DatePicker">
	<DatePicker label="Дата доставки" bind:value={day} />
</Showcase>

<Showcase name="DateRangePicker">
	<DateRangePicker label="Период" bind:value={period} />
</Showcase>

<Showcase name="FileUpload">
	<FileUpload
		label="Документ"
		accept="image/*"
		maxSizeMb={5}
		onUploaded={(mediaId) => (uploaded = [...uploaded, mediaId])}
	/>
</Showcase>
