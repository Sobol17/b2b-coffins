<script lang="ts">
	import * as BaseSelect from '$lib/ui/base/select/index.js';
	import { definedProps } from '$lib/utils/props';
	import Field from './Field.svelte';
	import type { SelectOption } from './options';

	let {
		options,
		label,
		hint,
		error,
		required = false,
		value = $bindable(''),
		id,
		name,
		placeholder = 'Выберите значение',
		disabled = false
	}: {
		options: readonly SelectOption[];
		label?: string | undefined;
		hint?: string | undefined;
		error?: string | undefined;
		required?: boolean;
		value?: string;
		id?: string | undefined;
		name?: string | undefined;
		placeholder?: string;
		disabled?: boolean;
	} = $props();

	const generatedId = $props.id();
	const fieldId = $derived(id ?? generatedId);
	const selected = $derived(options.find((option) => option.value === value));
</script>

<Field id={fieldId} {label} {hint} {error} {required}>
	{#snippet control()}
		<BaseSelect.Root type="single" bind:value {disabled} {required} {...definedProps({ name })}>
			<BaseSelect.Trigger id={fieldId} class="w-full" aria-invalid={error ? 'true' : undefined}>
				{selected?.label ?? placeholder}
			</BaseSelect.Trigger>
			<BaseSelect.Content>
				{#each options as option (option.value)}
					<BaseSelect.Item value={option.value} label={option.label} />
				{/each}
			</BaseSelect.Content>
		</BaseSelect.Root>
	{/snippet}
</Field>
