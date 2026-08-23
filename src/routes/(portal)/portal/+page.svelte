<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Портал контрагента</title></svelte:head>

<h1 data-testid="portal-home" class="text-xl font-semibold">Портал контрагента</h1>
<p class="text-fg-muted">Контрагент №{data.counterpartyId}</p>
