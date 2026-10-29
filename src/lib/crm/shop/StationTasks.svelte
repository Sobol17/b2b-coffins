<script lang="ts">
	import { resolve } from '$app/paths';
	import { PRIORITY_TITLE } from '$lib/crm/requests/labels';
	import { EmptyState, TONE_CLASS } from '$lib/ui';
	import type { ShopTaskListItemDto } from '$lib/types/crm-shop';
	import { formatDateTime } from '$lib/utils/format';

	let {
		title,
		tasks,
		timeZone,
		empty
	}: {
		title: string;
		tasks: readonly ShopTaskListItemDto[];
		timeZone: string;
		empty: string;
	} = $props();
</script>

<section class="flex flex-col gap-2">
	<h3 class="text-lg">{title}</h3>
	<ul class="flex flex-col gap-2">
		{#each tasks as task (task.id)}
			<li>
				<a
					href={resolve(`/crm/shop/${task.id}`)}
					class="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-card border border-border px-4 py-3 hover:bg-surface-muted"
					data-testid="shop-task"
				>
					<span class="font-heading text-lg">{task.number}</span>
					{#if task.priority === 'urgent'}
						<span class={['rounded-pill px-3 py-0.5 text-xs', TONE_CLASS.warning]}>
							{PRIORITY_TITLE.urgent}
						</span>
					{/if}
					{#if task.isStockRequest}
						<span class="text-sm text-fg-muted">На склад</span>
					{/if}
					<span class="text-sm">Сделано {task.doneCount} из {task.unitCount}</span>
					{#if task.deliveryAt}
						<span class="ml-auto text-sm text-fg-muted">
							срок {formatDateTime(task.deliveryAt, timeZone)}
						</span>
					{/if}
				</a>
			</li>
		{:else}
			<EmptyState title={empty} />
		{/each}
	</ul>
</section>
