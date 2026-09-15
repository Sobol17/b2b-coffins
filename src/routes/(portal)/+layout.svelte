<script lang="ts">
	import { resolve } from '$app/paths';
	import ContourShell from '$lib/ui/ContourShell.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const links = [
		{ href: resolve('/portal'), label: 'Главная' },
		{ href: resolve('/portal/profile'), label: 'Профиль' },
		{ href: resolve('/password/change'), label: 'Сменить пароль' }
	];
</script>

<ContourShell
	title="Портал контрагента"
	userName={data.user.fullName}
	roles={data.user.roles}
	{links}
>
	{@render children()}
</ContourShell>
