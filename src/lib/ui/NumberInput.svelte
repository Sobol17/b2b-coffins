<script lang="ts">
	import { Input as BaseInput } from '$lib/ui/base/input/index.js';
	import Field from './Field.svelte';

	let {
		label,
		hint,
		error,
		required = false,
		value = $bindable(0),
		min,
		max,
		step = 1,
		name,
		placeholder,
		disabled = false,
		id
	}: {
		label?: string | undefined;
		hint?: string | undefined;
		error?: string | undefined;
		required?: boolean;
		value?: number;
		min?: number;
		max?: number;
		step?: number;
		name?: string;
		/** Required: shown once the number is cleared. */
		placeholder: string;
		disabled?: boolean;
		id?: string | undefined;
	} = $props();

	const generatedId = $props.id();
	const fieldId = $derived(id ?? generatedId);
</script>

<Field id={fieldId} {label} {hint} {error} {required}>
	{#snippet control()}
		<BaseInput
			id={fieldId}
			{name}
			{required}
			{disabled}
			{min}
			{max}
			{step}
			{placeholder}
			type="number"
			inputmode="numeric"
			class="tabular-nums"
			bind:value
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
		/>
	{/snippet}
</Field>
