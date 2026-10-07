<script lang="ts">
	import * as Sidebar from '../base/sidebar/index.js';
	import type { ShellLink } from './types';

	let { link, active }: { link: ShellLink; active: boolean } = $props();

	const sidebar = Sidebar.useSidebar();
</script>

<Sidebar.MenuItem>
	<Sidebar.MenuButton
		isActive={active}
		tooltipContent={link.label}
		class="h-11 rounded-inset md:h-9"
	>
		{#snippet child({ props })}
			<!-- The phone sheet covers the page, so a tap on a section has to close it. -->
			<a
				{...props}
				href={link.href}
				aria-current={active ? 'page' : undefined}
				onclick={() => sidebar.setOpenMobile(false)}
			>
				{#if link.icon}
					<link.icon aria-hidden="true" />
				{/if}
				<span>{link.label}</span>
			</a>
		{/snippet}
	</Sidebar.MenuButton>
</Sidebar.MenuItem>
