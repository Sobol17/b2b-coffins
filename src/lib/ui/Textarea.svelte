<script lang="ts">
	import { Textarea as BaseTextarea } from '$lib/ui/base/textarea/index.js';
	import Field from './Field.svelte';

	let {
		label,
		hint,
		error,
		required = false,
		value = $bindable(''),
		id,
		name,
		placeholder,
		rows = 4,
		disabled = false,
		readonly = false,
		maxlength,
		class: className
	}: {
		label?: string | undefined;
		hint?: string | undefined;
		error?: string | undefined;
		required?: boolean;
		value?: string;
		id?: string | undefined;
		name?: string | undefined;
		/** Required: an empty field gives no hint of what goes in. */
		placeholder: string;
		rows?: number;
		disabled?: boolean;
		readonly?: boolean;
		maxlength?: number | undefined;
		class?: string | undefined;
	} = $props();

	const generatedId = $props.id();
	const fieldId = $derived(id ?? generatedId);
	const describedBy = $derived(error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined);
</script>

<Field id={fieldId} {label} {hint} {error} {required}>
	{#snippet control()}
		<BaseTextarea
			id={fieldId}
			{name}
			{rows}
			{required}
			{disabled}
			{readonly}
			{placeholder}
			{maxlength}
			class={className}
			bind:value
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={describedBy}
		/>
	{/snippet}
</Field>
