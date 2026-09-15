<script lang="ts">
	import { Label } from '$lib/ui/base/label/index.js';
	import type { Snippet } from 'svelte';

	/*
	 * Internal composition helper, not a primitive of tech.md 9: label, hint and error look the same
	 * on every control, and the third copy of that markup would be a rule violation (tech.md 13.1).
	 */
	let {
		id,
		label,
		hint,
		error,
		required = false,
		control
	}: {
		id: string;
		label?: string | undefined;
		hint?: string | undefined;
		error?: string | undefined;
		required?: boolean;
		control: Snippet;
	} = $props();
</script>

<div data-slot="field" class="flex flex-col gap-1.5">
	{#if label}
		<Label for={id} class="text-[0.8125rem] font-normal text-fg-muted">
			{label}
			{#if required}<span aria-hidden="true" class="text-danger">*</span>{/if}
		</Label>
	{/if}

	{@render control()}

	{#if error}
		<p id="{id}-error" class="text-xs text-danger">{error}</p>
	{:else if hint}
		<p id="{id}-hint" class="text-xs text-fg-muted">{hint}</p>
	{/if}
</div>
