<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Combobox, Input, Modal, withToast } from '$lib/ui';
	import type { BomChoicesDto } from '$lib/types/crm-bom';

	/** A new norm of the active version (C9): a variant, a component and the quantity per piece. */
	let { open = $bindable(false), choices }: { open?: boolean; choices: BomChoicesDto } = $props();

	const variants = $derived(
		choices.variants.map((variant) => ({
			value: String(variant.id),
			label: `${variant.sku} · ${variant.productTitle}`
		}))
	);
	const components = $derived(
		choices.components.map((component) => ({
			value: String(component.id),
			label: `${component.code} · ${component.title}, ${component.unitTitle}`
		}))
	);

	let variantId = $state('');
	let componentId = $state('');
	let pending = $state(false);
</script>

<Modal
	bind:open
	title="Новая норма"
	description="Сколько комплектующего уходит на одно изделие. Норма действует со следующей отметки выпуска."
>
	{#snippet body()}
		<form
			method="POST"
			action="?/normCreate"
			class="flex flex-col gap-4"
			use:enhance={withToast({
				pending: (value) => (pending = value),
				success: 'Норма добавлена',
				onSuccess: () => (open = false)
			})}
		>
			<Combobox
				name="variantId"
				label="Вариант"
				options={variants}
				placeholder="Выберите вариант"
				required
				bind:value={variantId}
			/>
			<Combobox
				name="componentId"
				label="Комплектующее"
				options={components}
				placeholder="Выберите комплектующее"
				required
				bind:value={componentId}
			/>
			<Input name="qtyPerUnitMilli" label="Норма на единицу" placeholder="Введите норму" required />
			<Button type="submit" loading={pending} class="self-start">Добавить норму</Button>
		</form>
	{/snippet}
</Modal>
