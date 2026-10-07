<script lang="ts">
	import { resolve } from '$app/paths';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import { ROLE_TITLE } from '$lib/crm/labels';
	import { CRM_HOME_LINK, crmNav } from '$lib/crm/nav';
	import { crmFeedHref } from '$lib/crm/notifications/feed-href';
	import NotificationBell from '$lib/notifications/NotificationBell.svelte';
	import { leaveOnLogout, pushStateFor } from '$lib/notifications/push-state.svelte';
	import ContourShell from '$lib/ui/ContourShell.svelte';
	import type { ShellLink } from '$lib/ui/shell/types';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const push = $derived(pushStateFor(data.push.publicKey));

	// On every app open: a subscription iOS re-issued after a pause is sent again without a tap.
	$effect(() => {
		// A failed sync leaves the toggle off; the person can still enable push by hand.
		push.sync().catch(() => undefined);
	});

	const links = $derived<ShellLink[]>([
		CRM_HOME_LINK,
		...crmNav(data.can),
		{ href: resolve('/password/change'), label: 'Сменить пароль', icon: KeyRoundIcon }
	]);
	const roles = $derived(data.user.roles.map((role) => ROLE_TITLE[role]));
</script>

<svelte:document onsubmit={(event) => void leaveOnLogout(event, push)} />

<ContourShell
	title="Мастерская"
	userName={data.user.fullName}
	{roles}
	{links}
	sidebarOpen={data.sidebarOpen}
>
	{#snippet bell()}
		<NotificationBell
			bell={data.bell}
			timeZone={data.timezone}
			hrefOf={crmFeedHref(data.can.requests)}
			allHref={resolve('/crm/notifications')}
			readUrl={resolve('/crm/notifications/read')}
		/>
	{/snippet}
	{@render children()}
</ContourShell>
