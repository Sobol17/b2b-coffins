<script lang="ts">
	import * as BaseRadioGroup from '$lib/ui/base/radio-group/index.js';
	import { definedProps } from '$lib/utils/props';
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
			class="flex flex-wrap gap-2"
			{...definedProps({ name })}
		>
			{#each options as option (option.value)}
				<!-- The whole pill is the label, so a click anywhere on it picks the option. -->
				<Label
					for="{fieldId}-{option.value}"
					class="h-11 cursor-pointer gap-2.5 rounded-pill border border-transparent bg-surface-muted px-4 transition-colors hover:bg-chip has-data-[state=checked]:border-primary has-data-[state=checked]:bg-surface-raised"
				>
					<BaseRadioGroup.Item value={option.value} id="{fieldId}-{option.value}" />
					{option.label}
				</Label>
			{/each}
		</BaseRadioGroup.Root>
	{/snippet}
</Field>
