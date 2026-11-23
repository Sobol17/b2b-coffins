<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Checkbox, Modal, Select, withToast } from '$lib/ui';
	import type { StockChoicesDto, StockRowDto } from '$lib/types/crm-stock';
	import { KIND_OPTIONS } from './labels';
	import StockItemFields from './StockItemFields.svelte';

	let {
		open = $bindable(false),
		choices,
		item
	}: {
		open?: boolean;
		choices: StockChoicesDto;
		item?: StockRowDto | undefined;
	} = $props();
	let isActive = $derived(item?.isActive ?? true);

	let kind = $state<string>('component');
	let pending = $state(false);
</script>

<Modal
	bind:open
	title={item ? 'Изменить позицию' : 'Новая позиция'}
	description="Вид после создания не меняется: на нём стоят движения."
>
	{#snippet body()}
		<form
			method="POST"
			action={item ? '?/update' : '?/create'}
			class="flex flex-col gap-4"
			use:enhance={withToast({
				pending: (value) => (pending = value),
				success: item ? 'Позиция сохранена' : 'Позиция заведена',
				onSuccess: () => (open = false)
			})}
		>
			{#if item}<input type="hidden" name="stockItemId" value={item.id} />{:else}
				<Select
					name="kind"
					label="Вид"
					options={KIND_OPTIONS}
					placeholder="Выберите вид"
					required
					bind:value={kind}
				/>
			{/if}
			<StockItemFields {choices} values={item} />
			{#if item}<Checkbox name="isActive" label="Позиция активна" bind:checked={isActive} />{/if}
			<Button type="submit" loading={pending} class="self-start"
				>{item ? 'Сохранить позицию' : 'Завести позицию'}</Button
			>
		</form>
	{/snippet}
</Modal>
