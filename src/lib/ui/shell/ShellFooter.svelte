<script lang="ts">
	import type { ResolvedPathname } from '$app/types';

	let {
		caption,
		links = []
	}: {
		caption: string;
		/** Public documents of the site; the kit takes them as data, it does not know the routes. */
		links?: readonly { readonly href: ResolvedPathname; readonly title: string }[];
	} = $props();

	const year = new Date().getFullYear();
</script>

<footer class="mx-auto mb-6 w-full max-w-shell px-3 sm:px-6">
	<div
		class="flex flex-wrap items-center gap-x-7 gap-y-2 rounded-card bg-surface-raised px-6 py-6 text-sm text-fg-muted sm:px-10"
	>
		<span class="font-heading text-xl font-semibold tracking-[0.14em] text-fg">АНГЕЛ</span>
		<span>{caption}</span>
		{#if links.length > 0}
			<nav aria-label="Документы" class="flex flex-wrap gap-x-5 gap-y-1">
				{#each links as link (link.href)}
					<a href={link.href} class="hover:text-link">{link.title}</a>
				{/each}
			</nav>
		{/if}
		<span class="ml-auto text-fg-faint">© {year}</span>
	</div>
</footer>
