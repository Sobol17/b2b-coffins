<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import RequisitesFields from '$lib/crm/counterparties/RequisitesFields.svelte';
	import TermsFields from '$lib/crm/counterparties/TermsFields.svelte';
	import { Breadcrumbs, Button, Card, withToast } from '$lib/ui';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let pending = $state(false);
</script>

<svelte:head><title>Новый контрагент</title></svelte:head>

<div class="mx-auto flex w-full max-w-4xl flex-col gap-6">
	<Breadcrumbs
		items={[
			{ label: 'Контрагенты', href: resolve('/crm/counterparties') },
			{ label: 'Новый контрагент' }
		]}
	/>
	<div>
		<h1 class="mb-2 text-3xl">Новый контрагент</h1>
		<p class="text-fg-muted">Доступ в портал можно выдать из карточки контрагента.</p>
	</div>

	<form
		method="POST"
		action="?/create"
		class="flex flex-col gap-6"
		use:enhance={withToast({
			reset: false,
			success: 'Контрагент заведён',
			pending: (value) => (pending = value)
		})}
	>
		<Card.Root>
			<Card.Header><Card.Title>Реквизиты</Card.Title></Card.Header>
			<Card.Content class="grid grid-cols-1 gap-4 md:grid-cols-2">
				<RequisitesFields />
			</Card.Content>
		</Card.Root>
		<Card.Root>
			<Card.Header><Card.Title>Условия</Card.Title></Card.Header>
			<Card.Content class="grid grid-cols-1 gap-4 md:grid-cols-2">
				<TermsFields choices={data.choices} />
			</Card.Content>
		</Card.Root>
		<Button type="submit" size="lg" loading={pending} class="self-start">
			Завести контрагента
		</Button>
	</form>
</div>
