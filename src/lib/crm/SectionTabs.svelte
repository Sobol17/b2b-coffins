<script lang="ts">
	import { page } from '$app/state';
	import type { ResolvedPathname } from '$app/types';

	/* Pages of one section, the same strip everywhere: reports, payroll, stock, catalog, alerts. */
	let {
		tabs,
		label,
		testId
	}: {
		tabs: readonly { href: ResolvedPathname; label: string }[];
		label: string;
		testId?: string | undefined;
	} = $props();
</script>

<nav
	aria-label={label}
	data-testid={testId}
	class="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0"
>
	{#each tabs as tab (tab.href)}
		{@const isCurrent = page.url.pathname === tab.href}
		<a
			href={tab.href}
			aria-current={isCurrent ? 'page' : undefined}
			class={[
				'-mb-px flex min-h-touch shrink-0 items-center border-b-2 px-3 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
				isCurrent
					? 'border-brand font-medium text-fg'
					: 'border-transparent text-fg-muted hover:border-border-strong hover:text-fg'
			]}
		>
			{tab.label}
		</a>
	{/each}
</nav>
