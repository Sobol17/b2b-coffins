<script lang="ts">
	import KanbanCard, { type KanbanItem } from './KanbanCard.svelte';
	import { REQUEST_STATUS_META } from './status';
	import type { RequestStatus } from '$lib/types/request';

	let {
		status,
		items,
		total,
		onDrop,
		onMove
	}: {
		status: RequestStatus;
		items: readonly KanbanItem[];
		total?: number | undefined;
		onDrop: (id: number, status: RequestStatus) => void;
		onMove?: ((id: number, direction: -1 | 1) => void) | undefined;
	} = $props();

	function handleDrop(event: DragEvent): void {
		event.preventDefault();
		const raw = event.dataTransfer?.getData('text/plain');
		const id = raw === undefined ? Number.NaN : Number(raw);
		if (Number.isInteger(id)) onDrop(id, status);
	}
</script>

<section
	data-slot="kanban-column"
	data-status={status}
	role="group"
	aria-label={REQUEST_STATUS_META[status].label}
	class="flex min-w-56 flex-1 flex-col gap-2 rounded-card bg-surface-muted p-3"
	ondragover={(event) => event.preventDefault()}
	ondrop={handleDrop}
>
	<h3 class="flex items-baseline justify-between gap-2 text-sm font-medium text-fg-muted">
		<span>{REQUEST_STATUS_META[status].label}</span>
		<span data-slot="kanban-count" class="text-xs">
			{#if total !== undefined && total > items.length}
				{items.length} из {total}
			{:else}
				{total ?? items.length}
			{/if}
		</span>
	</h3>
	<div role="list" class="flex flex-col gap-2">
		{#each items as item (item.id)}
			<div role="listitem"><KanbanCard {item} {onMove} /></div>
		{/each}
	</div>
</section>
