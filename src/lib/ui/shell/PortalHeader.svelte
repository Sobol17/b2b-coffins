<script lang="ts">
	import { page } from '$app/state';
	import MenuIcon from '@lucide/svelte/icons/menu';
	import type { ResolvedPathname } from '$app/types';
	import Button from '../base/button/button.svelte';
	import Drawer from '../Drawer.svelte';
	import type { ShellLink } from './types';

	let {
		title,
		userName,
		roles,
		links,
		accountHref
	}: {
		title: string;
		userName: string;
		roles: readonly string[];
		links: readonly ShellLink[];
		accountHref?: ResolvedPathname | undefined;
	} = $props();

	let menuOpen = $state(false);

	const initials = $derived(
		userName
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part.charAt(0).toUpperCase())
			.join('')
	);

	function isCurrent(href: string): boolean {
		return page.url.pathname === href;
	}
</script>

<header class="sticky top-0 z-10 bg-surface px-4 pt-4 pb-2 sm:px-6">
	<div
		data-testid="portal-header"
		class="mx-auto flex h-16 max-w-shell items-center gap-4 rounded-card bg-surface-raised pr-3 pl-5 sm:h-20 sm:gap-8 sm:pr-5 sm:pl-7"
	>
		<span class="flex items-baseline gap-2.5">
			<span class="font-heading text-2xl font-semibold tracking-[0.14em]">АНГЕЛ</span>
			<span class="hidden text-[0.6875rem] tracking-[0.1em] text-fg-faint uppercase sm:inline">
				{title}
			</span>
		</span>

		<nav aria-label="Основная навигация" class="mx-auto hidden gap-1 md:flex">
			{#each links as link (link.href)}
				<Button
					variant="ghost"
					href={link.href}
					class={isCurrent(link.href) ? 'text-brand' : 'text-fg'}
					aria-current={isCurrent(link.href) ? 'page' : undefined}
				>
					{link.label}
				</Button>
			{/each}
		</nav>

		<div class="ml-auto flex items-center gap-2 md:ml-0">
			<span data-testid="actor-roles" class="sr-only">{roles.join(', ')}</span>
			{#if accountHref}
				<Button
					variant="secondary"
					size="sm"
					href={accountHref}
					data-testid="account-chip"
					class="gap-2 pl-1.5"
					aria-label="Профиль: {userName}"
				>
					<span
						aria-hidden="true"
						class="flex size-7 items-center justify-center rounded-pill bg-brand-200 text-[0.6875rem] text-brand"
					>
						{initials}
					</span>
					<span data-testid="actor-name" class="hidden sm:inline">{userName}</span>
				</Button>
			{:else}
				<span data-testid="actor-name" class="text-sm">{userName}</span>
			{/if}

			<form method="POST" action="/logout" class="hidden md:block">
				<Button type="submit" variant="secondary" size="sm">Выйти</Button>
			</form>

			<Button
				variant="secondary"
				class="w-11 px-0 md:hidden"
				aria-label="Открыть меню"
				data-testid="menu-button"
				onclick={() => (menuOpen = true)}
			>
				<MenuIcon />
			</Button>
		</div>
	</div>
</header>

<Drawer bind:open={menuOpen} title="Меню">
	{#snippet body()}
		<nav aria-label="Навигация" class="flex flex-col gap-2">
			{#each links as link (link.href)}
				<Button
					href={link.href}
					variant={isCurrent(link.href) ? 'primary' : 'ghost'}
					class="justify-start"
					aria-current={isCurrent(link.href) ? 'page' : undefined}
					onclick={() => (menuOpen = false)}
				>
					{link.label}
				</Button>
			{/each}
			<form method="POST" action="/logout" class="mt-4">
				<Button type="submit" variant="secondary" class="w-full">Выйти</Button>
			</form>
		</nav>
	{/snippet}
</Drawer>
