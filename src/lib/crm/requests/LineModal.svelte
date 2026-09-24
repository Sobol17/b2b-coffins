<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Combobox, Input, Modal, NumberInput, Select, withToast } from '$lib/ui';
	import type { CrmRequestVariantChoice, ItemsEditMode } from '$lib/types/crm-request';
	import type { RequestItemDto } from '$lib/types/request';

	/**
	 * `line` null adds a position, otherwise the quantity of that line changes or it goes away. In
	 * `controlled` mode the reason is required: it lands in the history of the request (v1.40).
	 */
	let {
		open = $bindable(false),
		line,
		mode,
		variants
	}: {
		open?: boolean;
		line: RequestItemDto | null;
		mode: ItemsEditMode;
		variants: readonly CrmRequestVariantChoice[];
	} = $props();

	let variantId = $state('');
	let optionId = $state('');
	let qty = $derived(line?.qty ?? 1);
	const controlled = $derived(mode === 'controlled');
	const variantOptions = $derived(
		variants.map((variant) => ({
			value: String(variant.id),
			label: `${variant.sku} · ${variant.productTitle}, ${variant.sizeCode}, ${variant.materialTitle}`
		}))
	);
	const colours = $derived([
		{ value: '', label: 'Без цвета' },
		...(variants.find((variant) => String(variant.id) === variantId)?.options ?? []).map(
			(option) => ({ value: String(option.id), label: option.title })
		)
	]);
	const close = { onSuccess: () => (open = false) };
</script>

{#snippet reason()}
	<Input
		name="comment"
		label="Причина изменения"
		placeholder="Введите причину"
		maxlength={500}
		required={controlled}
		hint={controlled ? 'Заявка в работе: причина попадёт в историю' : undefined}
	/>
{/snippet}

<Modal bind:open title={line ? `${line.productTitle}, ${line.sku}` : 'Добавить позицию'}>
	{#snippet body()}
		{#if line}
			<form
				method="POST"
				action="?/setQty"
				class="flex flex-col gap-4"
				use:enhance={withToast({ success: 'Количество изменено', ...close })}
			>
				<input type="hidden" name="itemId" value={line.id} />
				<NumberInput
					name="qty"
					label="Штук"
					min={1}
					max={999}
					placeholder="Введите количество"
					bind:value={qty}
				/>
				{@render reason()}
				<div class="flex flex-wrap gap-2">
					<Button type="submit">Сохранить</Button>
					<Button type="submit" variant="ghost" class="text-danger" formaction="?/removeLine">
						Удалить позицию
					</Button>
				</div>
			</form>
		{:else}
			<form
				method="POST"
				action="?/addLine"
				class="flex flex-col gap-4"
				use:enhance={withToast({ success: 'Позиция добавлена', ...close })}
			>
				<Combobox
					label="Позиция"
					options={variantOptions}
					placeholder="Выберите позицию"
					bind:value={variantId}
					required
				/>
				<Select label="Цвет" options={colours} placeholder="Выберите цвет" bind:value={optionId} />
				<input type="hidden" name="variantId" value={variantId} />
				<input type="hidden" name="optionId" value={optionId} />
				<NumberInput
					name="qty"
					label="Штук"
					min={1}
					max={999}
					placeholder="Введите количество"
					bind:value={qty}
				/>
				{@render reason()}
				<Button type="submit" class="self-start" disabled={variantId === ''}>Добавить</Button>
			</form>
		{/if}
	{/snippet}
</Modal>
