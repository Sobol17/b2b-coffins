<script lang="ts">
	import { resolve } from '$app/paths';
	import ContourShell from '$lib/ui/ContourShell.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// Only routes that exist: Каталог arrives with P3 and Заявки with P6 (tech.md 18.5).
	const links = [{ href: resolve('/portal'), label: 'Главная' }];

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
	{footerCaption}
>
	{@render children()}
</ContourShell>
