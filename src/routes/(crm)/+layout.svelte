<script lang="ts">
	import { resolve } from '$app/paths';
	import { ROLE_TITLE } from '$lib/crm/labels';
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

	const links = $derived.by((): ShellLink[] => [
		{ href: resolve('/crm'), label: 'Главная' },
		...(data.can.requests
			? [
					{ href: resolve('/crm/board'), label: 'Доска' },
					{ href: resolve('/crm/requests'), label: 'Заявки' }
				]
			: []),
		...(data.can.shop ? [{ href: resolve('/crm/shop'), label: 'Цех' }] : []),
		...(data.can.delivery ? [{ href: resolve('/crm/delivery'), label: 'Доставка' }] : []),
		...(data.can.stock ? [{ href: resolve('/crm/stock'), label: 'Склад' }] : []),
		...(data.can.payroll ? [{ href: resolve('/crm/payroll'), label: 'Выплаты' }] : []),
		...(data.can.catalog
			? [
					{ href: resolve('/crm/catalog'), label: 'Каталог' },
					{ href: resolve('/crm/prices'), label: 'Прайсы и скидки' }
				]
			: []),
		...(data.can.counterparties
			? [{ href: resolve('/crm/counterparties'), label: 'Контрагенты' }]
			: []),
		...(data.can.settings
			? [
					{ href: resolve('/crm/settings/users'), label: 'Пользователи' },
					{ href: resolve('/crm/settings/dicts'), label: 'Справочники' },
					{ href: resolve('/crm/settings/notifications'), label: 'Уведомления' },
					{ href: resolve('/crm/settings'), label: 'Настройки' }
				]
			: []),
		...(data.can.audit ? [{ href: resolve('/crm/settings/audit'), label: 'Журнал' }] : []),
		{ href: resolve('/password/change'), label: 'Сменить пароль' }
	]);
	const roles = $derived(data.user.roles.map((role) => ROLE_TITLE[role]));
</script>

<svelte:document onsubmit={(event) => void leaveOnLogout(event, push)} />

<ContourShell title="Мастерская" userName={data.user.fullName} {roles} {links}>
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
