<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import AccessCard from '$lib/crm/counterparties/AccessCard.svelte';
	import RequisitesFields from '$lib/crm/counterparties/RequisitesFields.svelte';
	import TermsFields from '$lib/crm/counterparties/TermsFields.svelte';
	import { Breadcrumbs, Button, Card, Input, withToast } from '$lib/ui';
	import { PLACEHOLDER } from '$lib/utils/placeholders';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let pending = $state(false);

	const created = $derived(form && 'result' in form ? form.result : undefined);
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
		<p class="text-fg-muted">
			Контрагент заводится вместе с администратором. Временный пароль уйдёт администратору на почту
			и один раз появится на этой странице.
		</p>
	</div>

	{#if created}
		<AccessCard access={created.access} title="Доступ создан">
			<a class="text-link" href={resolve(`/crm/counterparties/${created.counterpartyId}`)}>
				Открыть карточку контрагента
			</a>
		</AccessCard>
	{:else}
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
			<Card.Root>
				<Card.Header>
					<Card.Title>Администратор</Card.Title>
					<Card.Description
						>Он войдёт в портал первым и заведёт остальных сотрудников.</Card.Description
					>
				</Card.Header>
				<Card.Content class="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div class="md:col-span-2">
						<Input
							name="adminFullName"
							label="Имя и фамилия"
							placeholder={PLACEHOLDER.fullName}
							required
							autocomplete="off"
						/>
					</div>
					<Input
						name="adminEmail"
						type="email"
						label="Электронная почта"
						placeholder={PLACEHOLDER.email}
						required
						autocomplete="off"
					/>
					<Input name="adminPhone" type="tel" label="Телефон" placeholder={PLACEHOLDER.phone} />
				</Card.Content>
			</Card.Root>
			<Button type="submit" size="lg" loading={pending} class="self-start">
				Завести и отправить доступ
			</Button>
		</form>
	{/if}
</div>
