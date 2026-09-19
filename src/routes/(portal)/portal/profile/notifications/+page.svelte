<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import DeliveryLog from '$lib/portal/notifications/DeliveryLog.svelte';
	import FeedList from '$lib/portal/notifications/FeedList.svelte';
	import NotificationPrefsForm from '$lib/portal/notifications/NotificationPrefsForm.svelte';
	import { profileNavItems } from '$lib/portal/profile-nav';
	import ProfileNav from '$lib/portal/ProfileNav.svelte';
	import { Breadcrumbs, Card } from '$lib/ui';
	import type { ListQuery } from '$lib/types/list';
	import { withListQuery } from '$lib/utils/list-url';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const settings = $derived(data.settings);
	// After a save the action answers with the stored switches; they win over the loaded ones.
	const prefs = $derived(form && 'prefs' in form && form.prefs ? form.prefs : settings.prefs);
	const feed = $derived(data.feed);
	const query = $derived<ListQuery>({ page: settings.log.page, perPage: settings.log.perPage });
	const feedQuery = $derived<ListQuery>({ page: feed.page, perPage: feed.perPage });

	function changeQuery(next: ListQuery, prefix = ''): void {
		// Same page with a rewritten query string, so there is no route pattern to resolve.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(withListQuery(page.url, next, prefix), { keepFocus: true, noScroll: true });
	}
</script>

<svelte:head><title>Уведомления</title></svelte:head>

<div class="flex flex-col gap-4">
	<div class="px-2">
		<Breadcrumbs
			items={[
				{ label: 'Главная', href: resolve('/portal') },
				{ label: 'Профиль', href: resolve('/portal/profile') },
				{ label: 'Уведомления' }
			]}
		/>
	</div>

	<div class="grid grid-cols-1 gap-6 lg:grid-cols-[17.5rem_1fr] lg:items-start">
		<ProfileNav
			title={data.counterparty.name}
			items={profileNavItems('notifications', {
				staff: data.canManageStaff,
				prices: data.canManagePrices
			})}
		/>

		<section class="flex flex-col gap-6">
			<div class="px-2">
				<h1 class="mb-2 text-4xl">Уведомления</h1>
				<p class="max-w-2xl text-fg-muted">
					Выберите, о каких событиях по заявкам присылать письма. Администратор получает письма по
					всем заявкам агентства, сотрудник только по своим.
				</p>
			</div>

			<Card.Root>
				<Card.Content>
					<NotificationPrefsForm {prefs} email={settings.email} />
				</Card.Content>
			</Card.Root>

			<div class="px-2">
				<h2 class="mb-2 text-3xl">Лента событий</h2>
				<p class="max-w-2xl text-fg-muted">
					Всё, что произошло по вашим заявкам. Лента приходит в приложение всегда, выключить её
					нельзя: переключатели выше управляют только письмами и ботом.
				</p>
			</div>

			<Card.Root data-testid="notification-feed">
				<Card.Content>
					<FeedList
						rows={feed.rows}
						total={feed.total}
						query={feedQuery}
						onQueryChange={(next) => changeQuery(next, 'feed')}
						timeZone={data.timezone}
					/>
				</Card.Content>
			</Card.Root>

			<div class="px-2">
				<h2 class="mb-2 text-3xl">Журнал отправок</h2>
				<p class="max-w-2xl text-fg-muted">
					Письма, которые портал отправил вам. Если отправка не удалась, портал повторит её сам.
				</p>
			</div>

			<Card.Root data-testid="delivery-log">
				<Card.Content>
					<DeliveryLog
						rows={settings.log.rows}
						total={settings.log.total}
						{query}
						onQueryChange={(next) => changeQuery(next)}
						timeZone={data.timezone}
					/>
				</Card.Content>
			</Card.Root>
		</section>
	</div>
</div>
