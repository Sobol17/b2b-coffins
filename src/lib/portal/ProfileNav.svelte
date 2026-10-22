<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import { Button, Card } from '$lib/ui';

	/*
	 * Side menu of the profile pages from the mockups. It also holds the logout: the portal header
	 * stays for navigation only. Items are passed in, so P2 adds
	 * «Мои сотрудники» for cp_admin and P6 adds «Мои заявки» without touching this file.
	 * Below `lg` the menu is one scrolling row: a column took the whole first screen of a phone.
	 */
	let {
		title,
		items
	}: {
		title: string;
		items: ReadonlyArray<{ href: ResolvedPathname; label: string; active: boolean }>;
	} = $props();

	let nav: HTMLElement | undefined = $state();

	// On a phone the current section may sit past the right edge of the row: scroll the row to it.
	$effect(() => {
		const current = nav?.querySelector<HTMLElement>('[aria-current="page"]');
		if (!nav || !current) return;
		nav.parentElement?.scrollTo({ left: current.offsetLeft - nav.offsetLeft });
	});
</script>

<Card.Root size="sm" class="lg:sticky lg:top-28">
	<Card.Content
		class="flex flex-col gap-3 max-lg:flex-row max-lg:items-center max-lg:gap-1 max-lg:overflow-x-auto"
	>
		<div class="px-2 text-[0.9375rem] max-lg:hidden">{title}</div>
		<nav
			bind:this={nav}
			aria-label="Разделы профиля"
			class="flex flex-col gap-1 border-t border-border pt-3 max-lg:flex-row max-lg:border-0 max-lg:pt-0"
		>
			{#each items as item (item.href)}
				<Button
					href={item.href}
					variant={item.active ? 'primary' : 'ghost'}
					class={['justify-start max-lg:shrink-0', !item.active && 'text-fg']}
					aria-current={item.active ? 'page' : undefined}
				>
					{item.label}
				</Button>
			{/each}
		</nav>
		<form
			method="POST"
			action="/logout"
			class="border-t border-border pt-3 max-lg:shrink-0 max-lg:border-0 max-lg:pt-0"
		>
			<Button
				type="submit"
				variant="ghost"
				data-testid="logout"
				class="w-full justify-start text-fg max-lg:w-auto"
			>
				Выйти
			</Button>
		</form>
	</Card.Content>
</Card.Root>
