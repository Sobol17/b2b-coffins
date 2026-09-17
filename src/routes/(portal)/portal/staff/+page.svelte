<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { profileNavItems } from '$lib/portal/profile-nav';
	import ProfileNav from '$lib/portal/ProfileNav.svelte';
	import CreateStaffModal from '$lib/portal/staff/CreateStaffModal.svelte';
	import { ROLE_OPTIONS, STATUS_OPTIONS } from '$lib/portal/staff/labels';
	import StaffTable from '$lib/portal/staff/StaffTable.svelte';
	import { Breadcrumbs, Button, Card, ErrorState, FilterBar, type FilterField } from '$lib/ui';
	import type { ListQuery } from '$lib/types/list';
	import { withListQuery } from '$lib/utils/list-url';
	import { definedProps } from '$lib/utils/props';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const FILTER_KEYS = ['search', 'role', 'status'] as const;

	const fields: FilterField[] = [
		{
			key: 'search',
			label: 'Поиск по имени или почте',
			type: 'text',
			placeholder: 'Например: Иванов или ivanov@'
		},
		{
			key: 'role',
			label: 'Роль',
			type: 'select',
			placeholder: 'Все роли',
			options: [{ value: '', label: 'Все роли' }, ...ROLE_OPTIONS]
		},
		{
			key: 'status',
			label: 'Статус',
			type: 'select',
			placeholder: 'Все статусы',
			options: [{ value: '', label: 'Все статусы' }, ...STATUS_OPTIONS]
		}
	];

	let createOpen = $state(false);
	let filters = $state(readFilters());

	function readFilters(): Record<string, string> {
		const entries = FILTER_KEYS.map((key) => [key, page.url.searchParams.get(key) ?? ''] as const);
		return Object.fromEntries(entries.filter(([, value]) => value !== ''));
	}

	const query = $derived.by((): ListQuery => {
		const sort = page.url.searchParams.get('sort');
		const dir = page.url.searchParams.get('dir');
		// Annotated: inside a generic call the narrowed literal would widen back to string.
		const direction: ListQuery['dir'] = dir === 'asc' || dir === 'desc' ? dir : undefined;
		return {
			page: data.staff.page,
			perPage: data.staff.perPage,
			...definedProps({ sort: sort ?? undefined, dir: direction })
		};
	});

	function changeQuery(next: ListQuery): void {
		// Same page with a rewritten query string, so there is no route pattern to resolve.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(withListQuery(page.url, next), { keepFocus: true, noScroll: true });
	}

	const created = $derived(form && 'created' in form ? form.created : undefined);
	const createErrors = $derived(form && 'errors' in form ? form.errors : undefined);
	const failure = $derived(form && 'formError' in form ? form : undefined);
</script>

<svelte:head><title>Мои сотрудники</title></svelte:head>

<div class="flex flex-col gap-4">
	<div class="px-2">
		<Breadcrumbs
			items={[
				{ label: 'Главная', href: resolve('/portal') },
				{ label: 'Профиль', href: resolve('/portal/profile') },
				{ label: 'Мои сотрудники' }
			]}
		/>
	</div>

	<div class="grid grid-cols-1 gap-6 lg:grid-cols-[17.5rem_1fr] lg:items-start">
		<ProfileNav
			title={data.counterparty.name}
			items={profileNavItems('staff', {
				staff: data.canManageStaff,
				prices: data.canManagePrices
			})}
		/>

		<section class="flex flex-col gap-6">
			<div class="flex flex-wrap items-end gap-4 px-2">
				<div>
					<h1 class="mb-2 text-4xl">Мои сотрудники</h1>
					<p class="max-w-2xl text-fg-muted">
						Доступ к порталу для сотрудников агентства. Администратор управляет сотрудниками и видит
						закупочные цены, сотрудник работает с ценами агентства.
					</p>
				</div>
				<Button class="sm:ml-auto" onclick={() => (createOpen = true)}>Добавить сотрудника</Button>
			</div>

			{#if created}
				<Card.Root>
					<Card.Content class="flex flex-col gap-2" data-testid="created-access">
						<h2 class="text-2xl">Доступ создан: {created.member.fullName}</h2>
						<p class="text-fg-muted">
							{created.mailSent
								? `Письмо с доступом ушло на ${created.member.email}.`
								: 'Письмо не отправилось, передайте пароль сотруднику сами.'}
							Пароль показан один раз и после обновления страницы исчезнет.
						</p>
						<p>
							Временный пароль:
							<code
								data-testid="temporary-password"
								class="rounded-sm bg-surface-muted px-2 py-1 font-mono"
							>
								{created.temporaryPassword}
							</code>
						</p>
					</Card.Content>
				</Card.Root>
			{/if}

			{#if failure && failure.action !== 'create'}
				<div data-testid="staff-error">
					<ErrorState title={failure.formError ?? 'Действие не выполнено'} />
				</div>
			{/if}

			<Card.Root>
				<Card.Content class="flex flex-col gap-4">
					<FilterBar {fields} bind:filters />
					<StaffTable
						rows={data.staff.rows}
						total={data.staff.total}
						{query}
						onQueryChange={changeQuery}
						timeZone={data.timezone}
					/>
					<p class="text-sm text-fg-faint">
						Активных мест занято: {data.staff.activeCount} из {data.staff.staffLimit}
					</p>
				</Card.Content>
			</Card.Root>
		</section>
	</div>
</div>

<CreateStaffModal
	bind:open={createOpen}
	errors={createErrors}
	formError={failure?.action === 'create' ? failure.formError : undefined}
/>
