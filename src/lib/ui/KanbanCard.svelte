<script lang="ts" module>
	import type { RequestStatus } from '$lib/types/request';

	export interface KanbanItem {
		readonly id: number;
		readonly status: RequestStatus;
		readonly title: string;
		readonly subtitle?: string;
		/** The card opens its object; the move stays on drag and on the arrow keys (v1.40). */
		readonly href?: string;
		/** Short marks under the title: urgency, attention flags. */
		readonly tags?: readonly string[];
	}
</script>

<script lang="ts">
	import { TONE_CLASS } from './status';

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

	const focusRing =
		'focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none rounded-sm';
</script>

{#snippet body()}
	<span class="block text-sm font-medium">{item.title}</span>
	{#if item.subtitle}
		<span class="block text-xs text-fg-muted">{item.subtitle}</span>
	{/if}
{/snippet}

<!--
	The card is dragged with a mouse; its focusable part (a link or a button) takes the arrow keys.
	The drag data carries the id: a link would otherwise hand its url to the drop.
-->
<div
	data-slot="kanban-card"
	data-card-id={item.id}
	data-status={item.status}
	draggable="true"
	role="group"
	aria-label={item.title}
	class="w-full cursor-grab rounded-card border border-border bg-surface-raised p-3 text-left shadow-card"
	ondragstart={(event) => event.dataTransfer?.setData('text/plain', String(item.id))}
>
	{#if item.href}
		<!-- The href is a resolved route handed in by the page, not a pattern this primitive knows. -->
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		<a href={item.href} class={['block', focusRing]} onkeydown={onKeyDown}>{@render body()}</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	{:else}
		<button type="button" class={['block w-full text-left', focusRing]} onkeydown={onKeyDown}>
			{@render body()}
		</button>
	{/if}
	{#if item.tags && item.tags.length > 0}
		<span class="mt-2 flex flex-wrap gap-1">
			{#each item.tags as tag (tag)}
				<span
					data-slot="kanban-tag"
					class={['rounded-pill px-2 py-0.5 text-xs', TONE_CLASS.warning]}
				>
					{tag}
				</span>
			{/each}
		</span>
	{/if}
</div>
