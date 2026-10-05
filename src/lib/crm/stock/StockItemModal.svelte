<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Modal, Select, withToast } from '$lib/ui';
	import type { StockChoicesDto } from '$lib/types/crm-stock';
	import { KIND_OPTIONS } from './labels';
	import StockItemFields from './StockItemFields.svelte';

	let { open = $bindable(false), choices }: { open?: boolean; choices: StockChoicesDto } = $props();

	let kind = $state<string>('component');
	let pending = $state(false);
</script>

<Modal
	bind:open
	title="Новая позиция"
	description="Вид после создания не меняется: на нём стоят движения."
>
	{#snippet body()}
		<form
			method="POST"
			action="?/create"
			class="flex flex-col gap-4"
			use:enhance={withToast({
				pending: (value) => (pending = value),
				success: 'Позиция заведена'
			})}
		>
			<Select
				name="kind"
				label="Вид"
				options={KIND_OPTIONS}
				placeholder="Выберите вид"
				required
				bind:value={kind}
			/>
			<StockItemFields {choices} />
			<Button type="submit" loading={pending} class="self-start">Завести позицию</Button>
		</form>
	{/snippet}
</Modal>
