<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Checkbox, Select, withToast } from '$lib/ui';
	import type { CrmOptionDto, CrmVariantDto } from '$lib/types/crm-catalog';

	let { variant, options }: { variant: CrmVariantDto; options: readonly CrmOptionDto[] } = $props();
	const active = $derived(options.filter((row) => row.isActive));
	const defaults = $derived([
		{ value: '', label: 'Без цвета по умолчанию' },
		...active.map((row) => ({ value: String(row.id), label: row.title }))
	]);
	const chosen = (id: number) => variant.options.some((row) => row.optionId === id);
	const defaultId = $derived(variant.options.find((row) => row.isDefault)?.optionId);
</script>

<form
	method="POST"
	action="?/compatibility"
	class="flex flex-col gap-3"
	use:enhance={withToast({ success: 'Совместимость сохранена' })}
>
	<input type="hidden" name="variantId" value={variant.id} />
	{#if active.length === 0}<p class="text-sm text-fg-muted">
			Сначала добавьте цвет в каталоге.
		</p>{/if}
	<div class="flex flex-wrap gap-4">
		{#each active as option (option.id)}
			<Checkbox
				name="optionId"
				value={String(option.id)}
				label={option.title}
				checked={chosen(option.id)}
			/>
		{/each}
	</div>
	<Select
		name="defaultOptionId"
		label="Цвет по умолчанию"
		placeholder="Выберите цвет"
		options={defaults}
		value={String(defaultId ?? '')}
	/>
	<Button type="submit" variant="secondary" class="self-start">Сохранить цвета</Button>
</form>
