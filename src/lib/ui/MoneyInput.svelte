<script lang="ts">
	import { Input as BaseInput } from '$lib/ui/base/input/index.js';
	import Field from './Field.svelte';
	import { formatMinor, parseRublesToMinor } from '$lib/utils/format';

	/*
	 * The form shows whole rubles, the binding stays in kopecks (tech.md 13.1). While the field is
	 * being edited the raw text wins, so a half-typed amount is not reformatted under the cursor.
	 * Parsing tolerates the grouping spaces, so the formatted value can be edited in place.
	 */
	let {
		label,
		hint,
		error,
		required = false,
		valueMinor = $bindable(0),
		id,
		name,
		placeholder,
		disabled = false,
		blankZero = false
	}: {
		label?: string | undefined;
		hint?: string | undefined;
		error?: string | undefined;
		required?: boolean;
		valueMinor?: number;
		id?: string | undefined;
		name?: string | undefined;
		/** Required: shown once the amount is cleared. */
		placeholder: string;
		disabled?: boolean;
		/** Zero means "no price" in this field: it is drawn empty, so the placeholder shows. */
		blankZero?: boolean;
	} = $props();

	const generatedId = $props.id();
	const fieldId = $derived(id ?? generatedId);

	let draft = $state<string | null>(null);
	const text = $derived(draft ?? (blankZero && valueMinor === 0 ? '' : formatMinor(valueMinor)));
	const parseError = $derived(
		draft !== null && draft !== '' && parseRublesToMinor(draft) === null
			? 'Введите сумму в целых рублях'
			: undefined
	);

	function onInput(event: Event & { currentTarget: HTMLInputElement }): void {
		draft = event.currentTarget.value;
		// An emptied field clears the price; elsewhere an empty field keeps the last amount.
		if (blankZero && draft.trim() === '') {
			valueMinor = 0;
			return;
		}
		const parsed = parseRublesToMinor(draft);
		if (parsed !== null) valueMinor = parsed;
	}
</script>

<Field id={fieldId} {label} {hint} error={error ?? parseError} {required}>
	{#snippet control()}
		<BaseInput
			id={fieldId}
			{required}
			{disabled}
			type="text"
			inputmode="numeric"
			{placeholder}
			class="tabular-nums"
			value={text}
			oninput={onInput}
			onblur={() => (draft = null)}
			aria-invalid={(error ?? parseError) ? 'true' : undefined}
		/>
		<input type="hidden" {name} value={valueMinor} />
	{/snippet}
</Field>
