<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { CRM_ROLE_OPTIONS, USER_STATUS_OPTIONS } from '$lib/crm/labels';
	import AccessCard from '$lib/crm/users/AccessCard.svelte';
	import CreateUserModal from '$lib/crm/users/CreateUserModal.svelte';
	import RolesModal from '$lib/crm/users/RolesModal.svelte';
	import UsersTable from '$lib/crm/users/UsersTable.svelte';
	import { Button, Card, ErrorState, FilterBar, type FilterField } from '$lib/ui';
	import type { CrmUserDto } from '$lib/types/crm';
	import type { ListQuery } from '$lib/types/list';
	import { filtersOf, listQueryOf, withListQuery } from '$lib/utils/list-url';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const fields: FilterField[] = [
		{ key: 'search', label: 'Поиск', type: 'text', placeholder: 'Введите имя или почту' },
		{
			key: 'role',
			label: 'Роль',
			type: 'select',
			placeholder: 'Выберите роль',
			options: [{ value: '', label: 'Все роли' }, ...CRM_ROLE_OPTIONS]
		},
		{
			key: 'status',
			label: 'Статус',
			type: 'select',
			placeholder: 'Выберите статус',
			options: [{ value: '', label: 'Все статусы' }, ...USER_STATUS_OPTIONS]
		}
	];

	let createOpen = $state(false);
	let editing = $state<CrmUserDto | null>(null);
	let filters = $state(filtersOf(page.url, ['search', 'role', 'status']));

	const query = $derived(listQueryOf(page.url, data.users));

	function changeQuery(next: ListQuery): void {
		// Same page with a rewritten query string, so there is no route pattern to resolve.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(withListQuery(page.url, next), { keepFocus: true, noScroll: true });
	}

	const access = $derived(form && 'access' in form ? form : undefined);
	const createErrors = $derived(form && 'errors' in form ? form.errors : undefined);
	const failure = $derived(form && 'formError' in form ? form : undefined);
</script>

<svelte:head><title>Пользователи</title></svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
	<div class="flex flex-wrap items-end gap-4">
		<div>
			<h1 class="mb-2 text-3xl">Пользователи мастерской</h1>
			<p class="max-w-2xl text-fg-muted">
				Учётные записи сотрудников мастерской и их роли. Доступ контрагентов ведётся в карточке
				контрагента.
			</p>
		</div>
		<Button class="sm:ml-auto" onclick={() => (createOpen = true)}>Добавить пользователя</Button>
	</div>

	{#if access?.access}
		<AccessCard access={access.access} isReset={access.action === 'reset'} />
	{/if}

	{#if failure && failure.action !== 'create'}
		<div data-testid="users-error">
			<ErrorState title={failure.formError ?? 'Действие не выполнено'} />
		</div>
	{/if}

	<Card.Root>
		<Card.Content class="flex flex-col gap-4">
			<FilterBar {fields} bind:filters />
			<UsersTable
				rows={data.users.rows}
				total={data.users.total}
				{query}
				onQueryChange={changeQuery}
				onEditRoles={(user) => (editing = user)}
				timeZone={data.timezone}
			/>
		</Card.Content>
	</Card.Root>
</div>

<CreateUserModal
	bind:open={createOpen}
	errors={createErrors}
	formError={failure?.action === 'create' ? failure.formError : undefined}
/>
<RolesModal user={editing} onClose={() => (editing = null)} />
