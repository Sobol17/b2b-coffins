<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { ClassValue } from 'svelte/elements';

	let {
		href,
		class: className,
		testid,
		children
	}: {
		href: `tel:${string}`;
		class?: ClassValue | undefined;
		testid?: string | undefined;
		children: Snippet;
	} = $props();
</script>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- tel: dials a phone, it is not an app route resolve() could check -->
<a {href} class={className} data-testid={testid}>{@render children()}</a>
