<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import ClipboardListIcon from '@lucide/svelte/icons/clipboard-list';
	import MenuIcon from '@lucide/svelte/icons/menu';
	import type { ResolvedPathname } from '$app/types';
	import type { Snippet } from 'svelte';
	import Button from '../base/button/button.svelte';
	import Drawer from '../Drawer.svelte';
	import type { CartLink, ShellLink } from './types';

	let {
		title,
		userName,
		roles,
		links,
		accountHref,
		cart,
		search,
		bell
	}: {
		title: string;
		userName: string;
		roles: readonly string[];
		links: readonly ShellLink[];
		accountHref?: ResolvedPathname | undefined;
		cart?: CartLink | undefined;
		search?: Snippet | undefined;
		bell?: Snippet | undefined;
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
		class="mx-auto flex h-16 max-w-shell items-center gap-3 rounded-card bg-surface-raised pr-2.5 pl-4 sm:h-20 sm:gap-8 sm:pr-5 sm:pl-7"
	>
		<a
			href={resolve('/portal')}
			data-testid="home-logo"
			class="flex items-baseline gap-2.5 rounded-sm hover:text-link"
		>
			<span
				class="font-heading text-xl font-semibold tracking-[0.12em] sm:text-2xl sm:tracking-[0.14em]"
				>АНГЕЛ</span
			>
			<span
				class="hidden text-[0.6875rem] tracking-[0.1em] whitespace-nowrap text-fg-faint uppercase xl:inline"
			>
				{title}
			</span>
		</a>

		<nav aria-label="Основная навигация" class="mx-auto hidden gap-1 md:flex">
			{#each links as link (link.href)}
				<Button
					variant="ghost"
					href={link.href}
					class={isCurrent(link.href) ? 'text-link' : 'text-fg'}
					aria-current={isCurrent(link.href) ? 'page' : undefined}
				>
					{link.label}
				</Button>
			{/each}
			<!-- The account chip leaves the header on a phone, so its page moves into the menu. -->
			{#if accountHref}
				<Button
					href={accountHref}
					variant={isCurrent(accountHref) ? 'primary' : 'ghost'}
					class="justify-start sm:hidden"
					aria-current={isCurrent(accountHref) ? 'page' : undefined}
					onclick={() => (menuOpen = false)}
				>
					Профиль
				</Button>
			{/if}
		</nav>

		<div class="ml-auto flex items-center gap-1.5 sm:gap-2 md:ml-0">
			<span data-testid="actor-roles" class="sr-only">{roles.join(', ')}</span>
			{@render search?.()}
			{@render bell?.()}
			{#if cart}
				<Button
					variant={isCurrent(cart.href) ? 'primary' : 'secondary'}
					size="sm"
					href={cart.href}
					data-testid="cart-chip"
					class="gap-2 px-3 sm:px-4"
					aria-label="Заявка, изделий: {cart.count}"
				>
					<ClipboardListIcon class="sm:hidden" />
					<span class="hidden sm:inline">Заявка</span>
					{#if cart.count > 0}
						<span
							data-testid="cart-count"
							class="rounded-pill bg-brand px-2 text-xs text-brand-fg tabular-nums"
						>
							{cart.count}
						</span>
					{/if}
				</Button>
			{/if}
			{#if accountHref}
				<Button
					variant="secondary"
					size="sm"
					href={accountHref}
					data-testid="account-chip"
					class="hidden gap-2 px-1.5 sm:inline-flex lg:pr-4"
					aria-label="Профиль: {userName}"
				>
					<span
						aria-hidden="true"
						class="flex size-7 items-center justify-center rounded-pill bg-brand-200 text-[0.6875rem] text-brand"
					>
						{initials}
					</span>
					<span data-testid="actor-name" class="hidden lg:inline">{userName}</span>
				</Button>
			{:else}
				<span data-testid="actor-name" class="text-sm">{userName}</span>
			{/if}

			<Button
				variant="secondary"
				size="sm"
				class="w-9.5 px-0 md:hidden"
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
			<!-- The account chip leaves the header on a phone, so its page moves into the menu. -->
			{#if accountHref}
				<Button
					href={accountHref}
					variant={isCurrent(accountHref) ? 'primary' : 'ghost'}
					class="justify-start sm:hidden"
					aria-current={isCurrent(accountHref) ? 'page' : undefined}
					onclick={() => (menuOpen = false)}
				>
					Профиль
				</Button>
			{/if}
		</nav>
	{/snippet}
</Drawer>
