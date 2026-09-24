<script lang="ts">
	import { resolve } from '$app/paths';
	import { ROLE_TITLE } from '$lib/crm/labels';
	import ContourShell from '$lib/ui/ContourShell.svelte';
	import type { ShellLink } from '$lib/ui/shell/types';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const links = $derived.by((): ShellLink[] => [
		{ href: resolve('/crm'), label: 'Главная' },
		...(data.can.requests
			? [
					{ href: resolve('/crm/board'), label: 'Доска' },
					{ href: resolve('/crm/requests'), label: 'Заявки' }
				]
			: []),
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
					{ href: resolve('/crm/settings'), label: 'Настройки' }
				]
			: []),
		...(data.can.audit ? [{ href: resolve('/crm/settings/audit'), label: 'Журнал' }] : []),
		{ href: resolve('/password/change'), label: 'Сменить пароль' }
	]);
	const roles = $derived(data.user.roles.map((role) => ROLE_TITLE[role]));
</script>

<ContourShell title="Мастерская" userName={data.user.fullName} {roles} {links}>
	{@render children()}
</ContourShell>
