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
	import { telHrefOf } from '$lib/portal/landing/tel';
	import CookieNotice from '$lib/legal/CookieNotice.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const telHref = $derived(telHrefOf(data.contacts.phone));

	const TITLE = 'Гробы и кресты от производителя в Иркутске: фабрика «Ангел»';
	const DESCRIPTION =
		'Фабрика еврогробов «Ангел», Иркутск. Гробы, кресты и объёмные фигуры собственного производства для ритуальных агентств по договору. Доставка входит в стоимость.';

	// Organization card for search engines. `<` is escaped so a value cannot close the script tag.
	const jsonLd = $derived(
		JSON.stringify({
			'@context': 'https://schema.org',
			'@type': 'Organization',
			name: 'Фабрика еврогробов «Ангел»',
			url: data.origin,
			logo: `${data.origin}/icons/icon-512.png`,
			...(data.contacts.operator ? { legalName: data.contacts.operator.name } : {}),
			...(data.contacts.operator?.inn ? { taxID: data.contacts.operator.inn } : {}),
			...(data.contacts.phone ? { telephone: data.contacts.phone } : {}),
			...(data.contacts.operator?.email ? { email: data.contacts.operator.email } : {}),
			address: {
				'@type': 'PostalAddress',
				addressLocality: 'Иркутск',
				addressCountry: 'RU',
				// An address that names only the city adds nothing to the locality.
				...(data.contacts.address && data.contacts.address !== 'г. Иркутск'
					? { streetAddress: data.contacts.address }
					: {})
			}
		}).replace(/</g, '\\u003c')
	);
	// The closing tag is split: written whole, it would end this script block.
	const ldScript = $derived(`<script type="application/ld+json">${jsonLd}</` + 'script>');
</script>

<svelte:head>
	<title>{TITLE}</title>
	<meta name="description" content={DESCRIPTION} />
	<link rel="canonical" href="{data.origin}/" />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="Ангел" />
	<meta property="og:locale" content="ru_RU" />
	<meta property="og:title" content={TITLE} />
	<meta property="og:description" content={DESCRIPTION} />
	<meta property="og:url" content="{data.origin}/" />
	<meta property="og:image" content="{data.origin}/icons/icon-512.png" />
	<meta name="geo.placename" content="Иркутск" />
	<meta name="geo.region" content="RU-IRK" />
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- JSON built above from settings, `<` escaped. -->
	{@html ldScript}
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
	<LandingFooter contacts={data.contacts} {telHref} />
</div>

<CookieNotice />
