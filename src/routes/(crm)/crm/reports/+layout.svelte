<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { buttonVariants } from '$lib/ui';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const sections = [
		{ href: resolve('/crm/reports'), label: 'Сводка' },
		{ href: resolve('/crm/reports/sales'), label: 'Продажи' },
		{ href: resolve('/crm/reports/stock'), label: 'Склад' },
		{ href: resolve('/crm/reports/funnel'), label: 'Воронка' },
		{ href: resolve('/crm/reports/lost'), label: 'Отменённые и отклонённые' },
		{ href: resolve('/crm/reports/charity'), label: 'Фонд' },
		// The payroll report of C10 stays where it is, under its own right.
		{ href: resolve('/crm/payroll/reports'), label: 'Выплаты' }
	];
</script>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
	<nav class="flex flex-wrap gap-2" aria-label="Отчёты" data-testid="reports-nav">
		{#each sections as section (section.href)}
			{@const isCurrent = page.url.pathname === section.href}
			<a
				href={section.href}
				aria-current={isCurrent ? 'page' : undefined}
				class={buttonVariants({ variant: isCurrent ? 'secondary' : 'ghost', size: 'sm' })}
			>
				{section.label}
			</a>
		{/each}
	</nav>
	{@render children()}
</div>
