<script lang="ts">
	import LandingFooter from '$lib/portal/landing/LandingFooter.svelte';
	import LandingHeader from '$lib/portal/landing/LandingHeader.svelte';
	import { telHrefOf } from '$lib/portal/landing/tel';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const telHref = $derived(telHrefOf(data.contacts.phone));
</script>

<div class="flex min-h-screen flex-col">
	<LandingHeader phone={data.contacts.phone} {telHref} />
	<main class="mx-auto w-full max-w-shell flex-1 px-4 pt-4 pb-10 sm:px-6">
		{@render children()}
	</main>
	<LandingFooter contacts={data.contacts} {telHref} />
</div>
