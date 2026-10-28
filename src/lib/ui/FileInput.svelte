<script lang="ts">
	import Field from './Field.svelte';

	/*
	 * A file field of a form action (v1.64): the file goes with the form, not through the upload
	 * collection of FileUpload. The server checks the file again; `accept` only narrows the picker.
	 */
	let {
		label,
		hint,
		error,
		name,
		accept,
		required = false,
		disabled = false,
		id
	}: {
		label?: string | undefined;
		hint?: string | undefined;
		error?: string | undefined;
		name: string;
		accept?: string | undefined;
		required?: boolean;
		disabled?: boolean;
		id?: string | undefined;
	} = $props();

	const generatedId = $props.id();
	const fieldId = $derived(id ?? generatedId);
	const describedBy = $derived(error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined);
</script>

<Field id={fieldId} {label} {hint} {error} {required}>
	{#snippet control()}
		<input
			id={fieldId}
			type="file"
			{name}
			{accept}
			{required}
			{disabled}
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={describedBy}
			class="block w-full rounded-inset border border-border bg-surface px-3 py-2 text-sm file:mr-3 file:rounded-pill file:border-0 file:bg-surface-muted file:px-3 file:py-1 file:text-sm"
		/>
	{/snippet}
</Field>
