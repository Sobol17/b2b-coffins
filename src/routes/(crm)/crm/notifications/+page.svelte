<script lang="ts">
	import PushToggle from '$lib/notifications/PushToggle.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { crmFeedHref } from '$lib/crm/notifications/feed-href';
	import FeedList from '$lib/notifications/FeedList.svelte';
	import NotificationPrefsForm from '$lib/notifications/NotificationPrefsForm.svelte';
	import { Card } from '$lib/ui';
	import type { ListQuery } from '$lib/types/list';
	import { withListQuery } from '$lib/utils/list-url';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// After a save the action answers with the stored switches; they win over the loaded ones.
	const prefs = $derived(form && 'prefs' in form && form.prefs ? form.prefs : data.prefs);
	const feed = $derived(data.feed);
	const query = $derived<ListQuery>({ page: feed.page, perPage: feed.perPage });

	function changeQuery(next: ListQuery): void {
		// Same page with a rewritten query string, so there is no route pattern to resolve.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(withListQuery(page.url, next), { keepFocus: true, noScroll: true });
	}
</script>

<svelte:head><title>Уведомления</title></svelte:head>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
	<div>
		<h1 class="mb-2 text-3xl">Уведомления</h1>
		<p class="max-w-2xl text-fg-muted">
			Всё, что произошло по вашей части. Лента приходит в приложение всегда, выключить её нельзя.
		</p>
	</div>

	<Card.Root data-testid="notification-feed">
		<Card.Content>
			<FeedList
				rows={feed.rows}
				total={feed.total}
				{query}
				onQueryChange={changeQuery}
				timeZone={data.timezone}
				hrefOf={crmFeedHref(data.can.requests)}
				readUrl={resolve('/crm/notifications/read')}
			/>
		</Card.Content>
	</Card.Root>

	<div>
		<h2 class="mb-2 text-2xl">Каналы</h2>
		<p class="max-w-2xl text-fg-muted">Выберите, о каких событиях присылать пуш-уведомления.</p>
	</div>

	<Card.Root>
		<Card.Content>
			<PushToggle publicKey={data.push.publicKey} />
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Content>
			<NotificationPrefsForm {prefs} />
		</Card.Content>
	</Card.Root>
</div>
