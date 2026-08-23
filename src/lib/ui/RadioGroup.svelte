<script lang="ts">
	import * as BaseRadioGroup from '$lib/ui/base/radio-group/index.js';
	import { Label } from '$lib/ui/base/label/index.js';
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
		disabled?: boolean;
	} = $props();

	const generatedId = $props.id();
	const fieldId = $derived(id ?? generatedId);
</script>

<Field id={fieldId} {label} {hint} {error} {required}>
	{#snippet control()}
		<BaseRadioGroup.Root
			id={fieldId}
			bind:value
			{disabled}
			class="flex flex-col gap-2"
			{...name === undefined ? {} : { name }}
		>
			{#each options as option (option.value)}
				<div class="flex items-center gap-2">
					<BaseRadioGroup.Item value={option.value} id="{fieldId}-{option.value}" />
					<Label for="{fieldId}-{option.value}">{option.label}</Label>
				</div>
			{/each}
		</BaseRadioGroup.Root>
	{/snippet}
</Field>
