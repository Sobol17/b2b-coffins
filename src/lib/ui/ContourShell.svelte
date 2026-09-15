<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import type { Snippet } from 'svelte';
	import Button from './base/button/button.svelte';
	import PortalHeader from './shell/PortalHeader.svelte';
	import ShellFooter from './shell/ShellFooter.svelte';
	import type { CartLink, ShellLink } from './shell/types';

	/*
	 * One shell for both contours. The portal variant follows the mockups of tech.md 18: floating
	 * white header, mobile menu in a drawer, footer panel. The CRM keeps the dense bar until C1.
	 */
	let {
		title,
		userName,
		roles,
		links,
		variant = 'crm',
		accountHref,
		cart,
		footerCaption = 'Портал контрагента столярной мастерской',
		children
	}: {
		title: string;
		userName: string;
		roles: readonly string[];
		links: readonly ShellLink[];
		variant?: 'crm' | 'portal';
		accountHref?: ResolvedPathname | undefined;
		cart?: CartLink | undefined;
		footerCaption?: string;
		children: Snippet;
	} = $props();
</script>

{#if variant === 'portal'}
	<div class="flex min-h-screen flex-col">
		<PortalHeader {title} {userName} {roles} {links} {accountHref} {cart} />
		<main class="mx-auto w-full max-w-shell flex-1 px-4 pt-4 pb-10 sm:px-6">
			{@render children()}
		</main>
		<ShellFooter caption={footerCaption} />
	</div>
{:else}
	<div class="flex min-h-screen flex-col">
		<header
			class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-surface-raised px-4 py-3 sm:px-6"
		>
			<strong class="font-heading text-xl">{title}</strong>

			<nav class="flex flex-1 flex-wrap gap-1 text-sm">
				{#each links as link (link.href)}
					<Button variant="ghost" size="sm" href={link.href}>{link.label}</Button>
				{/each}
			</nav>

			<span data-testid="actor-name" class="text-sm">{userName}</span>
			<span data-testid="actor-roles" class="text-sm text-fg-muted">{roles.join(', ')}</span>

			<form method="POST" action="/logout">
				<Button type="submit" variant="secondary" size="sm">Выйти</Button>
			</form>
		</header>

		<main class="flex-1 p-4 sm:p-6">{@render children()}</main>
	</div>
{/if}
