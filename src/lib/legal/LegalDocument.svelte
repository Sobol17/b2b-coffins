<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { Breadcrumbs } from '$lib/ui';
	import type { PublicContacts } from '$lib/types/landing';
	import { LEGAL_EDITION } from './docs';
	import OperatorDetails from './OperatorDetails.svelte';

	/** Frame of a public document: title, edition, the text and the requisites of the operator. */
	let {
		title,
		contacts,
		site,
		children
	}: { title: string; contacts: PublicContacts; site: string; children: Snippet } = $props();
</script>

<svelte:head>
	<title>{title} · Ангел</title>
	<meta name="description" content="{title} сайта {site}." />
</svelte:head>

<div class="mb-4 px-2">
	<Breadcrumbs items={[{ label: 'Главная', href: resolve('/') }, { label: title }]} />
</div>
<article
	class="mx-auto flex max-w-3xl flex-col gap-4 rounded-card bg-surface-raised p-6 leading-relaxed sm:p-10 [&_h2]:mt-4 [&_h2]:text-2xl [&_li]:ml-5 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1"
>
	<h1 class="text-3xl sm:text-4xl">{title}</h1>
	<p class="text-sm text-fg-muted">Редакция от {LEGAL_EDITION}</p>
	{@render children()}
	<h2>Реквизиты оператора</h2>
	<OperatorDetails {contacts} {site} />
</article>
