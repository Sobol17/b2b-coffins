<script lang="ts">
	import { resolve } from '$app/paths';
	import ContourShell from '$lib/ui/ContourShell.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// Only routes that exist: Каталог arrives with P3 and Заявки with P6 (tech.md 18.5).
	const links = [{ href: resolve('/portal'), label: 'Главная' }];
</script>

<ContourShell
	variant="portal"
	title="портал контрагента"
	userName={data.user.fullName}
	roles={data.user.roles}
	{links}
	accountHref={resolve('/portal/profile')}
>
	{@render children()}
</ContourShell>
