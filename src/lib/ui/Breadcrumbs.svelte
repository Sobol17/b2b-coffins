<script lang="ts" module>
	import type { ResolvedPathname } from '$app/types';

	export interface Crumb {
		readonly label: string;
		readonly href?: ResolvedPathname;
	}
</script>

<script lang="ts">
	import * as Breadcrumb from '$lib/ui/base/breadcrumb/index.js';

	let { items }: { items: readonly Crumb[] } = $props();
</script>

<Breadcrumb.Root>
	<Breadcrumb.List>
		{#each items as item, index (item.label)}
			<Breadcrumb.Item>
				{#if item.href && index < items.length - 1}
					<Breadcrumb.Link href={item.href}>{item.label}</Breadcrumb.Link>
				{:else}
					<Breadcrumb.Page>{item.label}</Breadcrumb.Page>
				{/if}
			</Breadcrumb.Item>
			{#if index < items.length - 1}
				<Breadcrumb.Separator />
			{/if}
		{/each}
	</Breadcrumb.List>
</Breadcrumb.Root>
