<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Modal, NumberInput, RadioGroup, Select, Textarea, withToast } from '$lib/ui';
	import { STOCK_MOVE_MAX, type StockCardDto, type StockChoicesDto } from '$lib/types/crm-stock';

	/**
	 * One manual move (C8, tech.md v1.45). A purchase only brings stock in; an adjustment goes
	 * either way and names its reason. The form sends the signed quantity.
	 */
	let {
		open = $bindable(false),
		card,
		choices
	}: { open?: boolean; card: StockCardDto; choices: StockChoicesDto } = $props();

	const TYPES = [
		{ value: 'purchase', label: 'Приход (закупка)' },
		{ value: 'adjustment', label: 'Корректировка' }
	];
	const DIRECTIONS = [
		{ value: 'plus', label: 'Прибавить' },
		{ value: 'minus', label: 'Списать' }
	];

	const colours = $derived([
		{ value: '', label: 'Без цвета' },
		...card.colors.map((colour) => ({ value: String(colour.id), label: colour.title }))
	]);
	const reasons = $derived(
		choices.reasons.map((reason) => ({ value: String(reason.id), label: reason.title }))
	);

	let type = $state('purchase');
	let direction = $state('plus');
	let amount = $state(1);
	let optionId = $state('');
	let reasonId = $state('');
	let pending = $state(false);

	const isAdjustment = $derived(type === 'adjustment');
	const qty = $derived(isAdjustment && direction === 'minus' ? 0 - amount : amount);
</script>

<Modal bind:open title="Движение по позиции" description={`${card.title}, ${card.unitTitle}`}>
	{#snippet body()}
		<form
			method="POST"
			action="?/move"
			class="flex flex-col gap-4"
			use:enhance={withToast({
				pending: (value) => (pending = value),
				success: 'Движение записано',
				onSuccess: () => (open = false)
			})}
		>
			<Select
				name="type"
				label="Тип"
				options={TYPES}
				placeholder="Выберите тип"
				required
				bind:value={type}
			/>
			{#if isAdjustment}
				<RadioGroup label="Направление" options={DIRECTIONS} bind:value={direction} />
			{/if}
			{#if card.kind === 'product'}
				<Select
					name="optionId"
					label="Цвет"
					options={colours}
					placeholder="Выберите цвет"
					bind:value={optionId}
				/>
			{/if}
			<NumberInput
				label="Количество"
				placeholder="Введите количество"
				required
				min={1}
				max={STOCK_MOVE_MAX}
				bind:value={amount}
			/>
			<input type="hidden" name="qty" value={qty} />
			{#if isAdjustment}
				<Select
					name="reasonId"
					label="Причина"
					options={reasons}
					placeholder="Выберите причину"
					required
					bind:value={reasonId}
				/>
			{/if}
			<Textarea
				name="comment"
				label="Комментарий"
				placeholder="Введите комментарий"
				maxlength={500}
			/>
			<Button type="submit" loading={pending} class="self-start">Записать движение</Button>
		</form>
	{/snippet}
</Modal>
