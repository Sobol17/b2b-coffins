<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import AgencyPriceTable from '$lib/portal/prices/AgencyPriceTable.svelte';
	import { profileNavItems } from '$lib/portal/profile-nav';
	import ProfileNav from '$lib/portal/ProfileNav.svelte';
	import { Breadcrumbs, Button, Card, ErrorState, FilterBar, type FilterField } from '$lib/ui';
	import type { ListQuery } from '$lib/types/list';
	import { withListQuery } from '$lib/utils/list-url';
	import { definedProps } from '$lib/utils/props';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const fields = $derived<FilterField[]>([
		{ key: 'search', label: 'Поиск по названию или артикулу', type: 'text' },
		{
			key: 'categoryId',
			label: 'Раздел',
			type: 'select',
			options: [
				{ value: '', label: 'Все разделы' },
				...data.categories.map((category) => ({
					value: String(category.id),
					label: category.title
				}))
			]
		}
	]);

	let filters = $state(readFilters());
	let saving = $state(false);

	function readFilters(): Record<string, string> {
		const entries = ['search', 'categoryId'].map(
			(key) => [key, page.url.searchParams.get(key) ?? ''] as const
		);
		return Object.fromEntries(entries.filter(([, value]) => value !== ''));
	}

	const query = $derived.by((): ListQuery => {
		const sort = page.url.searchParams.get('sort');
		const dir = page.url.searchParams.get('dir');
		// Annotated: inside a generic call the narrowed literal would widen back to string.
		const direction: ListQuery['dir'] = dir === 'asc' || dir === 'desc' ? dir : undefined;
		return {
			page: data.prices.page,
			perPage: data.prices.perPage,
			...definedProps({ sort: sort ?? undefined, dir: direction })
		};
	});

	function changeQuery(next: ListQuery): void {
		// Same page with a rewritten query string, so there is no route pattern to resolve.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(withListQuery(page.url, next), { keepFocus: true, noScroll: true });
	}

	const saved = $derived(form && 'saved' in form ? form.saved : undefined);
	const failure = $derived(form && 'formError' in form ? form.formError : undefined);
</script>

<svelte:head><title>Мои цены</title></svelte:head>

<div class="flex flex-col gap-4">
	<div class="px-2">
		<Breadcrumbs
			items={[
				{ label: 'Главная', href: resolve('/portal') },
				{ label: 'Профиль', href: resolve('/portal/profile') },
				{ label: 'Мои цены' }
			]}
		/>
	</div>

	<div class="grid gap-6 lg:grid-cols-[17.5rem_1fr] lg:items-start">
		<ProfileNav
			title={data.counterparty.name}
			items={profileNavItems('prices', {
				staff: data.canManageStaff,
				prices: data.canManagePrices
			})}
		/>

		<section class="flex flex-col gap-6">
			<div class="px-2">
				<h1 class="mb-2 text-4xl">Мои цены</h1>
				<p class="max-w-2xl text-fg-muted">
					Цены, которые ваши сотрудники показывают клиенту. Одна цена на модель: размер и опции её
					не меняют. Заявка считается по закупочным ценам, эти цены на неё не влияют. Пустое поле
					означает, что цена не задана.
				</p>
			</div>

			{#if saved}
				<p data-testid="prices-saved" class="px-2 text-fg-muted">
					Сохранено цен: {saved.updated}. Очищено: {saved.cleared}.
				</p>
			{/if}

			{#if failure}
				<div data-testid="prices-error"><ErrorState title={failure} /></div>
			{/if}

			<Card.Root>
				<Card.Content class="flex flex-col gap-4">
					<FilterBar {fields} bind:filters />
					<form
						method="POST"
						action="?/save"
						use:enhance={() => {
							saving = true;
							return async ({ update }) => {
								await update({ reset: false });
								saving = false;
							};
						}}
					>
						<AgencyPriceTable
							rows={data.prices.rows}
							total={data.prices.total}
							{query}
							onQueryChange={changeQuery}
						/>
						<div class="flex justify-end pt-4">
							<Button type="submit" loading={saving}>Сохранить цены</Button>
						</div>
					</form>
				</Card.Content>
			</Card.Root>
		</section>
	</div>
</div>
