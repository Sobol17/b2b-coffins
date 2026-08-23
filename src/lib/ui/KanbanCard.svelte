<script lang="ts" module>
	import type { RequestStatus } from '$lib/types/request';

	export interface KanbanItem {
		readonly id: number;
		readonly status: RequestStatus;
		readonly title: string;
		readonly subtitle?: string;
	}
</script>

<script lang="ts">
	let {
		item,
		onMove
	}: {
		item: KanbanItem;
		onMove?: ((id: number, direction: -1 | 1) => void) | undefined;
	} = $props();

	// Dragging is a mouse gesture; the arrow keys give the same move to a keyboard (tech.md 16).
	function onKeyDown(event: KeyboardEvent): void {
		if (onMove === undefined) return;
		if (event.key === 'ArrowLeft') onMove(item.id, -1);
		else if (event.key === 'ArrowRight') onMove(item.id, 1);
		else return;
		event.preventDefault();
	}
</script>

<!-- A real button: the card is dragged with a mouse and moved with the arrow keys. -->
<button
	type="button"
	data-slot="kanban-card"
	data-card-id={item.id}
	data-status={item.status}
	draggable="true"
	class="w-full cursor-grab rounded-card border border-border bg-surface-raised p-3 text-left shadow-card focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
	ondragstart={(event) => event.dataTransfer?.setData('text/plain', String(item.id))}
	onkeydown={onKeyDown}
>
	<span class="block text-sm font-medium">{item.title}</span>
	{#if item.subtitle}
		<span class="block text-xs text-fg-muted">{item.subtitle}</span>
	{/if}
</button>
