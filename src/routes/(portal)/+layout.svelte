<script lang="ts">
	import { resolve } from '$app/paths';
	import NotificationBell from '$lib/portal/notifications/NotificationBell.svelte';
	import HeaderSearch from '$lib/portal/search/HeaderSearch.svelte';
	import ContourShell from '$lib/ui/ContourShell.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// Only routes that exist: Заявки arrive with P6 (tech.md 18.5).
	const links = [
		{ href: resolve('/portal'), label: 'Главная' },
		{ href: resolve('/portal/catalog'), label: 'Каталог' }
	];

	const footerCaption = $derived.by(() => {
		const manager = data.counterparty.manager;
		if (!manager) return `${data.counterparty.name}: портал контрагента`;
		return [`Менеджер ${manager.fullName}`, manager.phone, manager.email]
			.filter((part) => part !== null)
			.join(' · ');
	});
</script>

<ContourShell
	variant="portal"
	title="портал контрагента"
	userName={data.user.fullName}
	roles={data.user.roles}
	{links}
	accountHref={resolve('/portal/profile')}
	cart={{ href: resolve('/portal/cart'), count: data.cartUnits }}
	{footerCaption}
>
	{#snippet search()}
		<HeaderSearch rights={{ staff: data.canManageStaff, prices: data.canManagePrices }} />
	{/snippet}
	{#snippet bell()}
		<NotificationBell bell={data.bell} timeZone={data.timezone} />
	{/snippet}
	{@render children()}
</ContourShell>
