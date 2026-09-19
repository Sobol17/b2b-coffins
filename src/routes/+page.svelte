<script lang="ts">
	import LandingAssortment from '$lib/portal/landing/LandingAssortment.svelte';
	import LandingCharity from '$lib/portal/landing/LandingCharity.svelte';
	import LandingFooter from '$lib/portal/landing/LandingFooter.svelte';
	import LandingHeader from '$lib/portal/landing/LandingHeader.svelte';
	import LandingHero from '$lib/portal/landing/LandingHero.svelte';
	import LandingPartner from '$lib/portal/landing/LandingPartner.svelte';
	import LandingProduction from '$lib/portal/landing/LandingProduction.svelte';
	import LandingSky from '$lib/portal/landing/LandingSky.svelte';
	import LandingSteps from '$lib/portal/landing/LandingSteps.svelte';
	import LandingWorks from '$lib/portal/landing/LandingWorks.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// tel: wants digits and the leading plus only.
	const telHref = $derived(
		data.contacts.phone ? (`tel:${data.contacts.phone.replace(/[^\d+]/g, '')}` as const) : null
	);
</script>

<svelte:head>
	<title>Ангел: гробы и кресты собственного производства</title>
	<meta
		name="description"
		content="Столярная мастерская: оптовые поставки гробов и крестов ритуальным агентствам по договору."
	/>
</svelte:head>

<LandingSky />

<div class="flex min-h-screen flex-col">
	<LandingHeader phone={data.contacts.phone} {telHref} />
	<main class="flex-1">
		<LandingHero {telHref} />
		<LandingAssortment />
		<LandingWorks works={data.works} />
		<LandingProduction />
		<LandingSteps />
		{#if data.charity}
			<LandingCharity charity={data.charity} />
		{/if}
		<LandingPartner {telHref} />
	</main>
	<LandingFooter phone={data.contacts.phone} address={data.contacts.address} {telHref} />
</div>
