<script lang="ts">
	import { resolve } from '$app/paths';
	import BellIcon from '@lucide/svelte/icons/bell';
	import { Button, Popover } from '$lib/ui';
	import type { NotificationBellDto, NotificationFeedItemDto } from '$lib/types/notifications';
	import { formatDateTime } from '$lib/utils/format';
	import { EVENT_LABEL } from './labels';
	import { markFeedRead } from './read-feed';

	/*
	 * The bell of tech.md 18.5. The counter arrives with the layout data and is recounted on every
	 * navigation; opening the panel marks the rows it shows and keeps the answer until the next load.
	 */
	let { bell, timeZone }: { bell: NotificationBellDto; timeZone: string } = $props();

	let open = $state(false);
	/** The answer of the last mark, tied to the counter it corrected: fresh data wins over it. */
	let marked = $state<{ from: number; unread: number; ids: number[] } | null>(null);

	const fresh = $derived(marked?.from === bell.unread ? marked : null);
	const unread = $derived(fresh?.unread ?? bell.unread);
	const items = $derived(
		bell.items.map((item) => ({
			...item,
			isRead: item.isRead || (fresh?.ids.includes(item.id) ?? false)
		}))
	);

	async function onOpenChange(next: boolean): Promise<void> {
		open = next;
		if (!next) return;
		const ids = bell.items.filter((item) => !item.isRead).map((item) => item.id);
		if (ids.length === 0) return;
		const left = await markFeedRead(ids);
		if (left !== null) marked = { from: bell.unread, unread: left, ids };
	}
</script>

<Popover.Root bind:open {onOpenChange}>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="secondary"
				size="sm"
				data-testid="bell-button"
				class="relative w-9.5 px-0"
				aria-label="Уведомления, непрочитанных: {unread}"
			>
				<BellIcon />
				{#if unread > 0}
					<span
						data-testid="bell-count"
						class="absolute -top-1 -right-1 min-w-5 rounded-pill bg-brand px-1 text-xs text-brand-fg tabular-nums"
					>
						{unread}
					</span>
				{/if}
			</Button>
		{/snippet}
	</Popover.Trigger>

	<Popover.Content align="end" class="w-80 gap-0 p-0">
		<h2 class="px-4 py-3 font-heading text-base">Уведомления</h2>
		{#if items.length === 0}
			<p class="px-4 pb-4 text-fg-muted">Пока ничего не произошло.</p>
		{:else}
			<ul class="flex flex-col border-t border-border">
				{#each items as item (item.id)}
					<li>
						{#if item.requestId === null}
							<div data-testid="bell-item" class="flex flex-col gap-0.5 px-4 py-2.5">
								{@render line(item)}
							</div>
						{:else}
							<a
								href={resolve(`/portal/requests/${item.requestId}`)}
								data-testid="bell-item"
								class="flex flex-col gap-0.5 px-4 py-2.5 hover:bg-surface-muted"
								onclick={() => (open = false)}
							>
								{@render line(item)}
							</a>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
		<a
			href={resolve('/portal/profile/notifications')}
			data-testid="bell-all"
			class="border-t border-border px-4 py-3 text-link hover:underline"
			onclick={() => (open = false)}
		>
			Все уведомления
		</a>
	</Popover.Content>
</Popover.Root>

{#snippet line(item: NotificationFeedItemDto)}
	<span class={item.isRead ? 'text-fg-muted' : 'text-fg'}>{EVENT_LABEL[item.eventKey].title}</span>
	<span class="text-xs text-fg-faint">
		{item.requestNumber ?? '—'} · {formatDateTime(item.createdAt, timeZone)}
	</span>
{/snippet}
