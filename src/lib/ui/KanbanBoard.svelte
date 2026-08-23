<script lang="ts">
	import KanbanColumn from './KanbanColumn.svelte';
	import type { KanbanItem } from './KanbanCard.svelte';
	import type { RequestStatus } from '$lib/types/request';

	/*
	 * The board only reports a move. Whether the transition is allowed is decided by the state
	 * machine on the server, so a card dropped into a forbidden column comes back (tech.md 6.2).
	 */
	let {
		columns,
		items,
		onDrop
	}: {
		columns: readonly RequestStatus[];
		items: readonly KanbanItem[];
		onDrop: (id: number, status: RequestStatus) => void;
	} = $props();

	function move(id: number, direction: -1 | 1): void {
		const item = items.find((candidate) => candidate.id === id);
		if (item === undefined) return;
		const target = columns[columns.indexOf(item.status) + direction];
		if (target !== undefined) onDrop(id, target);
	}
</script>

<div data-slot="kanban-board" class="flex gap-3 overflow-x-auto">
	{#each columns as status (status)}
		<KanbanColumn
			{status}
			items={items.filter((item) => item.status === status)}
			{onDrop}
			onMove={move}
		/>
	{/each}
</div>
