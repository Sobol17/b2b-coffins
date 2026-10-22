<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { profileNavItems } from '$lib/portal/profile-nav';
	import ProfileNav from '$lib/portal/ProfileNav.svelte';
	import SupportThreadList from '$lib/support/SupportThreadList.svelte';
	import { Breadcrumbs, Button } from '$lib/ui';
	import type { ListQuery } from '$lib/types/list';
	import { withListQuery } from '$lib/utils/list-url';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const isAdmin = $derived(data.user.roles.includes('cp_admin'));
	const query = $derived<ListQuery>({ page: data.threads.page, perPage: data.threads.perPage });

	function changeQuery(next: ListQuery): void {
		// Same page with a rewritten query string, so there is no route pattern to resolve.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(withListQuery(page.url, next), { keepFocus: true, noScroll: true });
	}
</script>

<svelte:head><title>Чат</title></svelte:head>

<div class="flex flex-col gap-4">
	<div class="px-2">
		<Breadcrumbs
			items={[
				{ label: 'Главная', href: resolve('/portal') },
				{ label: 'Профиль', href: resolve('/portal/profile') },
				{ label: 'Чат' }
			]}
		/>
	</div>

	<div class="grid grid-cols-1 gap-6 lg:grid-cols-[17.5rem_1fr] lg:items-start">
		<ProfileNav
			title={data.counterparty.name}
			items={profileNavItems('support', {
				staff: data.canManageStaff,
				prices: data.canManagePrices
			})}
		/>

		<section class="flex flex-col gap-6">
			<div class="flex flex-wrap items-end gap-4 px-2">
				<div>
					<h1 data-testid="support-title" class="mb-2 text-4xl">Обращения</h1>
					<p class="max-w-2xl text-fg-muted">
						{isAdmin
							? 'Вопросы агентства к мастерской по заявкам и не только.'
							: 'Ваши вопросы к мастерской по заявкам и не только.'}
					</p>
				</div>
				<Button class="sm:ml-auto" href={resolve('/portal/support/new')} data-testid="support-new">
					Новое обращение
				</Button>
			</div>

			<SupportThreadList
				threads={data.threads}
				{query}
				onQueryChange={changeQuery}
				contour="portal"
				showAuthor={isAdmin}
				timeZone={data.timezone}
				hrefOf={(id) => resolve(`/portal/support/${id}`)}
			/>
		</section>
	</div>
</div>
