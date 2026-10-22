<script lang="ts">
	import { resolve } from '$app/paths';
	import { LEGAL_DOCS, LEGAL_EDITION } from '$lib/legal/docs';
	import { Breadcrumbs } from '$lib/ui';
</script>

<svelte:head><title>Документы · Ангел</title></svelte:head>

<div class="mb-4 px-2">
	<Breadcrumbs items={[{ label: 'Главная', href: resolve('/') }, { label: 'Документы' }]} />
</div>
<section class="mx-auto flex max-w-3xl flex-col gap-4 rounded-card bg-surface-raised p-6 sm:p-10">
	<h1 class="text-3xl sm:text-4xl">Документы</h1>
	<p class="text-sm text-fg-muted">Редакция от {LEGAL_EDITION}</p>
	<ul class="flex flex-col gap-2">
		{#each LEGAL_DOCS as doc (doc.href)}
			<li><a class="text-link underline" href={doc.href}>{doc.title}</a></li>
		{/each}
	</ul>
</section>
