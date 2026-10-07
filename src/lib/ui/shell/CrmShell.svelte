<script lang="ts">
	import { page } from '$app/state';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import type { Snippet } from 'svelte';
	import * as Sidebar from '../base/sidebar/index.js';
	import CrmSidebarLink from './CrmSidebarLink.svelte';
	import { groupLinks } from './groups';
	import type { ShellLink } from './types';

	/*
	 * CRM shell: a grouped sidebar that folds to icons on a desktop and opens as a sheet on a phone,
	 * plus a thin bar with the fold button, the place in the app and the bell. Links without a group
	 * are account links and sit in the footer next to the name.
	 */
	let {
		title,
		userName,
		roles,
		links,
		sidebarOpen = true,
		bell,
		children
	}: {
		title: string;
		userName: string;
		roles: readonly string[];
		links: readonly ShellLink[];
		sidebarOpen?: boolean;
		bell?: Snippet | undefined;
		children: Snippet;
	} = $props();

	const groups = $derived(groupLinks(links));
	const accountLinks = $derived(links.filter((link) => link.group === undefined));

	// The deepest link that prefixes the path wins, so /crm/settings/users does not light Настройки.
	const current = $derived.by(() => {
		const path = page.url.pathname;
		return links
			.filter((link) => path === link.href || path.startsWith(`${link.href}/`))
			.reduce<ShellLink | undefined>(
				(best, link) => (best === undefined || link.href.length > best.href.length ? link : best),
				undefined
			);
	});
</script>

<Sidebar.Provider open={sidebarOpen}>
	<Sidebar.Root collapsible="icon" class="border-sidebar-border">
		<Sidebar.Header class="h-14 justify-center px-4 group-data-[collapsible=icon]:px-2">
			<strong class="truncate font-heading text-xl group-data-[collapsible=icon]:hidden">
				{title}
			</strong>
			<strong
				class="hidden text-center font-heading text-xl group-data-[collapsible=icon]:block"
				aria-hidden="true"
			>
				{title.slice(0, 1)}
			</strong>
		</Sidebar.Header>

		<Sidebar.Content>
			<nav aria-label="Разделы">
				{#each groups as group (group.name)}
					<Sidebar.Group>
						<Sidebar.GroupLabel>{group.name}</Sidebar.GroupLabel>
						<Sidebar.GroupContent>
							<Sidebar.Menu>
								{#each group.items as link (link.href)}
									<CrmSidebarLink {link} active={current?.href === link.href} />
								{/each}
							</Sidebar.Menu>
						</Sidebar.GroupContent>
					</Sidebar.Group>
				{/each}
			</nav>
		</Sidebar.Content>

		<Sidebar.Footer class="border-t border-sidebar-border">
			<div class="px-2 py-1 leading-tight group-data-[collapsible=icon]:hidden">
				<div data-testid="actor-name" class="truncate text-sm font-medium">{userName}</div>
				<div data-testid="actor-roles" class="truncate text-xs text-fg-muted">
					{roles.join(', ')}
				</div>
			</div>
			<Sidebar.Menu>
				{#each accountLinks as link (link.href)}
					<CrmSidebarLink {link} active={current?.href === link.href} />
				{/each}
				<Sidebar.MenuItem>
					<form method="POST" action="/logout">
						<Sidebar.MenuButton
							tooltipContent="Выйти"
							class="h-11 rounded-inset text-fg-muted md:h-9"
						>
							{#snippet child({ props })}
								<button {...props} type="submit">
									<LogOutIcon aria-hidden="true" />
									<span>Выйти</span>
								</button>
							{/snippet}
						</Sidebar.MenuButton>
					</form>
				</Sidebar.MenuItem>
			</Sidebar.Menu>
		</Sidebar.Footer>
		<Sidebar.Rail />
	</Sidebar.Root>

	<Sidebar.Inset class="min-w-0 bg-surface">
		<header
			class="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-border bg-surface-raised px-2 sm:px-4"
		>
			<Sidebar.Trigger />
			<p class="min-w-0 flex-1 truncate text-sm text-fg-muted" data-testid="shell-place">
				{#if current?.group}
					<span class="hidden sm:inline">{current.group} / </span>
				{/if}
				<span class="font-medium text-fg">{current?.label ?? title}</span>
			</p>
			{@render bell?.()}
		</header>

		<main class="mx-auto w-full max-w-shell flex-1 p-4 sm:p-6">{@render children()}</main>
	</Sidebar.Inset>
</Sidebar.Provider>
