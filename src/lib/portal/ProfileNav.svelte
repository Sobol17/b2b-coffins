<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import { Button, Card } from '$lib/ui';

	/*
	 * Side menu of the profile pages from the mockups. Items are passed in, so P2 adds
	 * «Мои сотрудники» for cp_admin and P6 adds «Мои заявки» without touching this file.
	 */
	let {
		title,
		items
	}: {
		title: string;
		items: ReadonlyArray<{ href: ResolvedPathname; label: string; active: boolean }>;
	} = $props();
</script>

<Card.Root size="sm" class="lg:sticky lg:top-28">
	<Card.Content class="flex flex-col gap-3">
		<div class="px-2 text-[0.9375rem]">{title}</div>
		<nav aria-label="Разделы профиля" class="flex flex-col gap-1 border-t border-border pt-3">
			{#each items as item (item.href)}
				<Button
					href={item.href}
					variant={item.active ? 'primary' : 'ghost'}
					class={['justify-start', !item.active && 'text-fg']}
					aria-current={item.active ? 'page' : undefined}
				>
					{item.label}
				</Button>
			{/each}
		</nav>
	</Card.Content>
</Card.Root>
