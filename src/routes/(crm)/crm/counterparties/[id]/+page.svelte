<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import AccessCard from '$lib/crm/counterparties/AccessCard.svelte';
	import AddressesPanel from '$lib/crm/counterparties/AddressesPanel.svelte';
	import ContractsPanel from '$lib/crm/counterparties/ContractsPanel.svelte';
	import CounterpartyForms from '$lib/crm/counterparties/CounterpartyForms.svelte';
	import DebtIndicator from '$lib/crm/counterparties/DebtIndicator.svelte';
	import PaymentsTable from '$lib/crm/counterparties/PaymentsTable.svelte';
	import RequestHistory from '$lib/crm/counterparties/RequestHistory.svelte';
	import UsersPanel from '$lib/crm/counterparties/UsersPanel.svelte';
	import { Breadcrumbs, Card, Tabs } from '$lib/ui';
	import type { ListQuery } from '$lib/types/list';
	import { withListQuery } from '$lib/utils/list-url';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const card = $derived(data.card);
	let tab = $state(
		page.url.searchParams.has('reqPage') || page.url.searchParams.has('payPage') ? 'ledger' : 'card'
	);

	// Issued or resent access carries a temporary password: shown once, never reloaded.
	const access = $derived(
		form && 'result' in form && (form.action === 'adminIssue' || form.action === 'accessResend')
			? { dto: form.result, isResend: form.action === 'accessResend' }
			: undefined
	);

	function pageOf(prefix: 'req' | 'pay') {
		return (next: ListQuery): void => {
			// Same page with a rewritten query string, so there is no route pattern to resolve.
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			void goto(withListQuery(page.url, next, prefix), { keepFocus: true, noScroll: true });
		};
	}
</script>

<svelte:head><title>{card.name}</title></svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
	<Breadcrumbs
		items={[{ label: 'Контрагенты', href: resolve('/crm/counterparties') }, { label: card.name }]}
	/>
	<div class="flex flex-wrap items-center gap-4">
		<h1 class="text-3xl" data-testid="counterparty-name">{card.name}</h1>
		<DebtIndicator debt={card.debt} />
	</div>

	{#if access && 'temporaryPassword' in access.dto}
		<AccessCard
			access={access.dto}
			title={access.isResend ? 'Доступ отправлен повторно' : 'Администратор выдан'}
		/>
	{/if}

	<Tabs.Root bind:value={tab}>
		<!-- Four tabs do not fit a phone in one row: they wrap instead of widening the page. -->
		<Tabs.List class="h-auto max-w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto">
			<Tabs.Trigger value="card">Карточка</Tabs.Trigger>
			<Tabs.Trigger value="contracts">Договоры и адреса</Tabs.Trigger>
			<Tabs.Trigger value="users">Пользователи</Tabs.Trigger>
			<Tabs.Trigger value="ledger">Заявки и оплаты</Tabs.Trigger>
		</Tabs.List>
		<Tabs.Content value="card" class="pt-4">
			<CounterpartyForms {card} choices={data.choices} />
		</Tabs.Content>
		<Tabs.Content value="contracts" class="flex flex-col gap-6 pt-4">
			<ContractsPanel contracts={card.contracts} timeZone={data.timezone} />
			<AddressesPanel addresses={card.addresses} />
		</Tabs.Content>
		<Tabs.Content value="users" class="pt-4">
			<UsersPanel users={card.users} staffLimit={card.staffLimit} timeZone={data.timezone} />
		</Tabs.Content>
		<Tabs.Content value="ledger" class="flex flex-col gap-6 pt-4">
			<Card.Root>
				<Card.Header><Card.Title>История заявок</Card.Title></Card.Header>
				<Card.Content>
					<RequestHistory
						rows={data.requests.rows}
						total={data.requests.total}
						query={{ page: data.requests.page, perPage: data.requests.perPage }}
						onQueryChange={pageOf('req')}
						timeZone={data.timezone}
					/>
				</Card.Content>
			</Card.Root>
			{#if data.payments}
				<Card.Root>
					<Card.Header>
						<Card.Title>Отметки оплаты</Card.Title>
						<Card.Description>Задолженность считается по этим отметкам.</Card.Description>
					</Card.Header>
					<Card.Content>
						<PaymentsTable
							rows={data.payments.rows}
							total={data.payments.total}
							query={{ page: data.payments.page, perPage: data.payments.perPage }}
							onQueryChange={pageOf('pay')}
							timeZone={data.timezone}
						/>
					</Card.Content>
				</Card.Root>
			{/if}
		</Tabs.Content>
	</Tabs.Root>
</div>
