<script lang="ts">
	import { resolve } from '$app/paths';
	import ContourShell from '$lib/ui/ContourShell.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const links = [
		{ href: resolve('/crm'), label: 'Главная' },
		{ href: resolve('/password/change'), label: 'Сменить пароль' }
	];
</script>

<ContourShell title="Мастерская" userName={data.user.fullName} roles={data.user.roles} {links}>
	{@render children()}
</ContourShell>
