<script lang="ts">
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import * as Sidebar from '../base/sidebar/index.js';
	import { cn } from '$lib/utils/cn.js';
	import type { ShellLink } from './types';

	/*
	 * Phone tab bar of the CRM: the home screen and the first sections of the role, then «Ещё»,
	 * which opens the same sheet the sidebar becomes on a phone. One list feeds both, so a section
	 * is never missing from one of them.
	 */
	let { links, current }: { links: readonly ShellLink[]; current: ShellLink | undefined } =
		$props();

	const PRIMARY_COUNT = 4;

	const sidebar = Sidebar.useSidebar();
	const primary = $derived(
		links.filter((link) => link.group !== undefined).slice(0, PRIMARY_COUNT)
	);
	const moreActive = $derived(
		sidebar.openMobile || !primary.some((link) => link.href === current?.href)
	);

	const item =
		'group flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-inset text-[0.6875rem] font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50';
	const pill =
		'flex h-8 w-12 items-center justify-center rounded-pill transition-colors motion-reduce:transition-none';
</script>

<nav
	aria-label="Нижняя навигация"
	data-crm-bottom-bar
	class="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface-raised px-2 pb-[env(safe-area-inset-bottom)] md:hidden"
>
	<div class="mx-auto flex h-[4.5rem] max-w-lg items-center gap-1">
		{#each primary as link (link.href)}
			{@const active = !sidebar.openMobile && current?.href === link.href}
			<a
				href={link.href}
				aria-current={active ? 'page' : undefined}
				class={cn(item, active ? 'text-fg' : 'text-fg-muted hover:text-fg')}
			>
				<span
					class={cn(
						pill,
						active ? 'bg-primary text-primary-foreground' : 'group-hover:bg-surface-muted'
					)}
				>
					{#if link.icon}<link.icon class="size-5" aria-hidden="true" />{/if}
				</span>
				<span class="max-w-full truncate px-1">{link.label}</span>
			</a>
		{/each}
		<button
			type="button"
			aria-haspopup="dialog"
			aria-expanded={sidebar.openMobile}
			class={cn(item, moreActive ? 'text-fg' : 'text-fg-muted hover:text-fg')}
			onclick={() => sidebar.setOpenMobile(true)}
		>
			<span
				class={cn(
					pill,
					moreActive ? 'bg-primary text-primary-foreground' : 'group-hover:bg-surface-muted'
				)}
			>
				<EllipsisIcon class="size-5" aria-hidden="true" />
			</span>
			<span>Ещё</span>
		</button>
	</div>
</nav>
