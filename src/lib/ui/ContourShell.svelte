<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import type { Snippet } from 'svelte';
	import Button from './base/button/button.svelte';

	let {
		title,
		userName,
		roles,
		links,
		children
	}: {
		title: string;
		userName: string;
		roles: readonly string[];
		links: ReadonlyArray<{ href: ResolvedPathname; label: string }>;
		children: Snippet;
	} = $props();
</script>

<div class="flex min-h-screen flex-col">
	<header
		class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-surface-raised px-4 py-3 sm:px-6"
	>
		<strong class="text-lg">{title}</strong>

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
