<script lang="ts">
	import { Switch as BaseSwitch } from '$lib/ui/base/switch/index.js';
	import { Label } from '$lib/ui/base/label/index.js';

	let {
		label,
		checked = $bindable(false),
		id,
		name,
		disabled = false
	}: {
		label: string;
		checked?: boolean;
		id?: string | undefined;
		name?: string | undefined;
		disabled?: boolean;
	} = $props();

	const generatedId = $props.id();
	const fieldId = $derived(id ?? generatedId);
</script>

<div data-slot="switch-field" class="flex items-center gap-2">
	<BaseSwitch id={fieldId} {disabled} bind:checked {...name === undefined ? {} : { name }} />
	<Label for={fieldId}>{label}</Label>
</div>
