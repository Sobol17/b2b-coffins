<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { profileNavItems } from '$lib/portal/profile-nav';
	import ProfileNav from '$lib/portal/ProfileNav.svelte';
	import RequestRow from '$lib/portal/requests/RequestRow.svelte';
	import StatusChips from '$lib/portal/requests/StatusChips.svelte';
	import {
		Breadcrumbs,
		Button,
		Card,
		EmptyState,
		FilterBar,
		Pagination,
		Select,
		type FilterField
	} from '$lib/ui';
	import { REQUEST_STATUSES, type RequestStatus } from '$lib/types/request';
	import type { ListQuery } from '$lib/types/list';
	import { withListQuery } from '$lib/utils/list-url';
	import { definedProps } from '$lib/utils/props';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const FILTER_KEYS = ['search', 'from', 'to'] as const;

	const fields: FilterField[] = [
		{ key: 'search', label: 'Поиск по номеру', type: 'text' },
		{ key: 'from', label: 'Отправлена с', type: 'date' },
		{ key: 'to', label: 'по', type: 'date' }
	];

	const SORTS = [
		{ value: 'submittedAt:desc', label: 'Сначала новые' },
		{ value: 'submittedAt:asc', label: 'Сначала старые' },
		{ value: 'total:desc', label: 'По сумме' }
	];

	let filters = $state(readFilters());

	function readFilters(): Record<string, string> {
		const entries = FILTER_KEYS.map((key) => [key, page.url.searchParams.get(key) ?? ''] as const);
		return Object.fromEntries(entries.filter(([, value]) => value !== ''));
	}

	const selected = $derived(
		page.url.searchParams
			.getAll('status')
			.filter((value): value is RequestStatus =>
				(REQUEST_STATUSES as readonly string[]).includes(value)
			)
	);

	const query = $derived.by((): ListQuery => {
		const sort = page.url.searchParams.get('sort');
		const dir = page.url.searchParams.get('dir');
		// Annotated: inside a generic call the narrowed literal would widen back to string.
		const direction: ListQuery['dir'] = dir === 'asc' || dir === 'desc' ? dir : undefined;
		return {
			page: data.requests.page,
			perPage: data.requests.perPage,
			...definedProps({ sort: sort ?? undefined, dir: direction })
		};
	});

	const sortValue = $derived(`${query.sort ?? 'submittedAt'}:${query.dir ?? 'desc'}`);

	function changeQuery(next: ListQuery): void {
		// Same page with a rewritten query string, so there is no route pattern to resolve.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(withListQuery(page.url, next), { keepFocus: true, noScroll: true });
	}

	function changeSort(next: string): void {
		const [sort = 'submittedAt', dir = 'desc'] = next.split(':');
		changeQuery({ ...query, page: 1, sort, dir: dir === 'asc' ? 'asc' : 'desc' });
	}
</script>

<svelte:head><title>Мои заявки</title></svelte:head>

<div class="flex flex-col gap-4">
	<div class="px-2">
		<Breadcrumbs
			items={[
				{ label: 'Главная', href: resolve('/portal') },
				{ label: 'Профиль', href: resolve('/portal/profile') },
				{ label: 'Мои заявки' }
			]}
		/>
	</div>

	<div class="grid grid-cols-1 gap-6 lg:grid-cols-[17.5rem_1fr] lg:items-start">
		<ProfileNav
			title={data.counterparty.name}
			items={profileNavItems('requests', {
				staff: data.canManageStaff,
				prices: data.canManagePrices
			})}
		/>

		<section class="flex flex-col gap-6">
			<div class="flex flex-wrap items-end gap-4 px-2">
				<div>
					<h1 data-testid="requests-title" class="mb-2 text-4xl">Мои заявки</h1>
					<p class="max-w-2xl text-fg-muted">
						{data.user.roles.includes('cp_admin')
							? 'Заявки всего агентства: состав, статус и суммы.'
							: 'Заявки, которые вы отправили: состав и статус.'}
					</p>
				</div>
				<Button class="sm:ml-auto" href={resolve('/portal/catalog')}>Новая заявка</Button>
			</div>

			<Card.Root>
				<Card.Content class="flex flex-col gap-4">
					<StatusChips counts={data.requests.countsByStatus} {selected} />
					<div class="flex flex-wrap items-end gap-3">
						<FilterBar {fields} bind:filters />
						<div class="min-w-48">
							<Select
								label="Сортировка"
								options={data.user.canSeePrices ? SORTS : SORTS.slice(0, 2)}
								bind:value={() => sortValue, changeSort}
							/>
						</div>
					</div>
				</Card.Content>
			</Card.Root>

			{#if data.requests.rows.length === 0}
				<EmptyState
					title="Заявок не найдено"
					description="Измените фильтры или соберите новую заявку из каталога."
				/>
			{:else}
				<div class="flex flex-col gap-3">
					{#each data.requests.rows as row (row.id)}
						<RequestRow {row} timeZone={data.timezone} showAuthor={data.user.canSeePrices} />
					{/each}
				</div>
				<Pagination total={data.requests.total} {query} onQueryChange={changeQuery} />
			{/if}
		</section>
	</div>
</div>
