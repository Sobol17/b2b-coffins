<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { buttonVariants } from '$lib/ui';

	const tabs = [
		{ href: resolve('/crm/settings/notifications'), label: 'Матрица' },
		{ href: resolve('/crm/settings/notifications/templates'), label: 'Шаблоны' },
		{ href: resolve('/crm/settings/notifications/log'), label: 'Журнал отправок' }
	];

	// The matrix path is a prefix of the other two, so the longest match names the open tab.
	const current = $derived(
		tabs
			.filter((tab) => page.url.pathname.startsWith(tab.href))
			.sort((a, b) => b.href.length - a.href.length)[0]?.href
	);
</script>

<nav aria-label="Разделы уведомлений" class="flex flex-wrap gap-2" data-testid="notification-tabs">
	{#each tabs as tab (tab.href)}
		<a
			href={tab.href}
			aria-current={tab.href === current ? 'page' : undefined}
			class={buttonVariants({ variant: tab.href === current ? 'secondary' : 'ghost', size: 'sm' })}
		>
			{tab.label}
		</a>
	{/each}
</nav>
