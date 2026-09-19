<script lang="ts">
	import { Input as BaseInput } from '$lib/ui/base/input/index.js';
	import Field from './Field.svelte';
	import type { FullAutoFill } from 'svelte/elements';

	/*
	 * The prop surface is spelled out instead of extending HTMLInputAttributes: spreading the whole
	 * attribute surface produces a union TypeScript cannot represent under exactOptionalPropertyTypes.
	 */
	let {
		label,
		hint,
		error,
		required = false,
		value = $bindable(''),
		id,
		name,
		type = 'text',
		placeholder,
		autocomplete,
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
		type?: 'text' | 'email' | 'password' | 'search' | 'tel' | 'url' | 'time';
		/** Required: an empty field gives no hint of what goes in. */
		placeholder: string;
		autocomplete?: FullAutoFill | undefined;
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
		<BaseInput
			id={fieldId}
			{name}
			{type}
			{required}
			{disabled}
			{readonly}
			{placeholder}
			{autocomplete}
			{maxlength}
			class={className}
			bind:value
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={describedBy}
		/>
	{/snippet}
</Field>
