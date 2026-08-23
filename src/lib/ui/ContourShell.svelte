<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import type { Snippet } from 'svelte';

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
	<header class="flex flex-wrap items-center gap-4 border-b border-border px-6 py-3">
		<strong class="text-lg">{title}</strong>

		<nav class="flex flex-1 flex-wrap gap-3 text-sm">
			{#each links as link (link.href)}
				<a href={link.href} class="text-fg-muted underline">{link.label}</a>
			{/each}
		</nav>

		<span data-testid="actor-name" class="text-sm">{userName}</span>
		<span data-testid="actor-roles" class="text-sm text-fg-muted">{roles.join(', ')}</span>

		<form method="POST" action="/logout">
			<button type="submit" class="text-sm underline">Выйти</button>
		</form>
	</header>

	<main class="flex-1 p-6">{@render children()}</main>
</div>
