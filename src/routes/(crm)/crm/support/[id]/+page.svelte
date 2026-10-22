<script lang="ts">
	import { resolve } from '$app/paths';
	import SupportThreadView from '$lib/support/SupportThreadView.svelte';
	import { Breadcrumbs } from '$lib/ui';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const thread = $derived(data.thread);
	const failure = $derived(form && 'formError' in form ? form.formError : undefined);
</script>

<svelte:head><title>Обращение №{thread.id}</title></svelte:head>

<div class="mx-auto flex w-full max-w-4xl flex-col gap-6">
	<Breadcrumbs
		items={[
			{ label: 'Обращения', href: resolve('/crm/support') },
			{ label: `Обращение №${thread.id}` }
		]}
	/>

	<div>
		<h1 data-testid="support-subject" class="mb-2 text-3xl">{thread.subject}</h1>
		<p class="text-fg-muted">
			{#if data.canOpenCounterparty}
				<a class="underline" href={resolve(`/crm/counterparties/${thread.counterpartyId}`)}>
					{thread.counterpartyName}
				</a>
			{:else}
				{thread.counterpartyName}
			{/if}
		</p>
	</div>

	<SupportThreadView
		{thread}
		contour="crm"
		timeZone={data.timezone}
		formError={failure}
		requestHref={thread.requestId !== null && data.canOpenRequest
			? resolve(`/crm/requests/${thread.requestId}`)
			: null}
		newThreadHref={null}
	/>
</div>
