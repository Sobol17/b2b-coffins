<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import type { Snippet } from 'svelte';
	import CrmShell from './shell/CrmShell.svelte';
	import PortalHeader from './shell/PortalHeader.svelte';
	import ShellFooter from './shell/ShellFooter.svelte';
	import type { CartLink, ShellLink } from './shell/types';

	/*
	 * One shell for both contours. The portal variant follows the mockups of tech.md 18: floating
	 * white header, mobile menu in a drawer, footer panel. The CRM variant is a grouped sidebar that
	 * folds to icons and turns into a sheet on a phone.
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
		search,
		bell,
		sidebarOpen = true,
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
		/** Portal header search. The kit takes it as a snippet so it never imports portal code. */
		search?: Snippet | undefined;
		/** Notification bell of either contour, a snippet for the same reason: the kit holds the place. */
		bell?: Snippet | undefined;
		/** CRM only: the fold state the server read from the cookie, so the first paint does not jump. */
		sidebarOpen?: boolean;
		children: Snippet;
	} = $props();
</script>

{#if variant === 'portal'}
	<div class="flex min-h-screen flex-col">
		<PortalHeader {title} {userName} {roles} {links} {accountHref} {cart} {search} {bell} />
		<main class="mx-auto w-full max-w-shell flex-1 px-4 pt-4 pb-10 sm:px-6">
			{@render children()}
		</main>
		<ShellFooter caption={footerCaption} />
	</div>
{:else}
	<CrmShell {title} {userName} {roles} {links} {sidebarOpen} {bell}>
		{@render children()}
	</CrmShell>
{/if}
