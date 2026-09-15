<script lang="ts">
	import { Checkbox as BaseCheckbox } from '$lib/ui/base/checkbox/index.js';
	import { definedProps } from '$lib/utils/props';
	import { Label } from '$lib/ui/base/label/index.js';

	let {
		label,
		checked = $bindable(false),
		id,
		name,
		value,
		disabled = false
	}: {
		label: string;
		checked?: boolean;
		id?: string | undefined;
		name?: string | undefined;
		/** Submitted with the form when checked. Several boxes with one name send a list. */
		value?: string | undefined;
		disabled?: boolean;
	} = $props();

	const generatedId = $props.id();
	const fieldId = $derived(id ?? generatedId);
</script>

<div data-slot="checkbox-field" class="flex items-center gap-2">
	<BaseCheckbox id={fieldId} {disabled} bind:checked {...definedProps({ name, value })} />
	<Label for={fieldId}>{label}</Label>
</div>
