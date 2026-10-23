<script lang="ts">
	import EntryForm from '$lib/crm/finance/EntryForm.svelte';
	import type { FinanceOperationDto } from '$lib/types/finance';
	import { Modal } from '$lib/ui';

	/* The edit of a manual entry: the same form as on top of the page, filled from the feed line. */
	let {
		entry,
		today,
		onClose
	}: { entry: FinanceOperationDto | null; today: string; onClose: () => void } = $props();

	let open = $derived(entry !== null);
</script>

<Modal bind:open title="Изменить операцию" {onClose}>
	{#snippet body()}
		{#if entry}
			{#key entry.key}
				<EntryForm {entry} {today} onDone={onClose} />
			{/key}
		{/if}
	{/snippet}
</Modal>
