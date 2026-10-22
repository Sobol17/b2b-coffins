<script lang="ts">
	import LegalDocument from '$lib/legal/LegalDocument.svelte';
	import { DataTable, type DataTableColumn } from '$lib/ui';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const who = $derived(data.contacts.operator?.name ?? `владелец сайта ${data.site}`);

	// What the site actually stores. Keep the table in step with the code: a new key goes here too.
	const columns: DataTableColumn[] = [
		{ key: 'name', label: 'Название' },
		{ key: 'kind', label: 'Где' },
		{ key: 'purpose', label: 'Зачем' },
		{ key: 'term', label: 'Срок' }
	];
	// Four fixed rows: one page, so the table draws no pagination.
	const QUERY = { page: 1, perPage: 25 };

	const stored = [
		{
			id: 'sid',
			name: 'sid',
			kind: 'cookie',
			purpose: 'Держит вход в портал. Без неё войти нельзя.',
			term: '30 дней с последнего входа'
		},
		{
			id: 'sidebar_state',
			name: 'sidebar_state',
			kind: 'cookie',
			purpose: 'Помнит, свёрнуто ли боковое меню мастерской.',
			term: '7 дней'
		},
		{
			id: 'cookie-notice-closed',
			name: 'cookie-notice-closed',
			kind: 'хранилище браузера',
			purpose: 'Помнит, что вы закрыли сообщение о cookie.',
			term: 'пока вы не очистите данные сайта'
		},
		{
			id: 'banners',
			name: 'install-banner-closed, push-banner-closed',
			kind: 'хранилище браузера',
			purpose: 'Помнят, что вы закрыли предложение установить приложение и включить уведомления.',
			term: 'пока вы не очистите данные сайта'
		}
	] as const;
</script>

<LegalDocument title="Соглашение об использовании cookie" contacts={data.contacts} site={data.site}>
	<h2>1. Что такое cookie</h2>
	<p>
		Cookie это небольшой файл, который сайт сохраняет в вашем браузере. Сайт {data.site}, которым
		владеет {who}, использует cookie и хранилище браузера только для работы входа и интерфейса.
	</p>

	<h2>2. Что сайт сохраняет</h2>
	<DataTable {columns} rows={stored} total={stored.length} query={QUERY} onQueryChange={() => {}}>
		{#snippet cell(row: (typeof stored)[number], column: DataTableColumn)}
			{#if column.key === 'name'}
				<span class="font-mono text-xs">{row.name}</span>
			{:else if column.key === 'kind'}
				{row.kind}
			{:else if column.key === 'purpose'}
				{row.purpose}
			{:else}
				{row.term}
			{/if}
		{/snippet}
	</DataTable>
	<p>Рекламных и аналитических cookie на сайте нет. Сайт не передаёт cookie другим сервисам.</p>

	<h2>3. Ваше согласие</h2>
	<p>
		Продолжая пользоваться сайтом, вы соглашаетесь с тем, что сайт сохраняет эти данные в браузере.
		Вы можете удалить cookie или запретить их в настройках браузера. Без cookie <code>sid</code> вход
		в портал работать не будет, открытая часть сайта останется доступной.
	</p>

	<h2>4. Изменения соглашения</h2>
	<p>
		Владелец сайта вправе изменить соглашение. Новая редакция действует с момента публикации на этой
		странице.
	</p>
</LegalDocument>
