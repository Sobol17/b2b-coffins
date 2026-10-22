<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { BrandMark, Button } from '$lib/ui';

	/*
	 * One error page for every contour. The title follows the status, not the message: a raw
	 * message such as "internal error" says nothing to a person. A Russian message a route wrote
	 * itself (error(404, 'Контрагент не найден')) is shown under the title.
	 */
	const TITLES: Readonly<Record<number, string>> = {
		403: 'Нет доступа',
		404: 'Страница не найдена'
	};

	const title = $derived(TITLES[page.status] ?? 'Что-то пошло не так');
	const own = $derived(
		page.status < 500 && page.error?.message && /[а-яё]/i.test(page.error.message)
			? page.error.message
			: null
	);
	const hint = $derived(
		page.status === 403
			? 'У вашей роли нет прав на этот раздел.'
			: page.status === 404
				? 'Адрес набран с ошибкой или страницу убрали.'
				: 'Обновите страницу через минуту. Если ошибка повторится, сообщите администратору.'
	);
</script>

<svelte:head><title>{title} · Ангел</title></svelte:head>

<main
	class="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-5 p-6 text-center"
>
	<BrandMark class="size-14" />
	<p class="font-heading text-6xl font-semibold text-fg-faint" data-testid="error-status">
		{page.status}
	</p>
	<h1 class="text-3xl">{title}</h1>
	{#if own}<p data-testid="error-message">{own}</p>{/if}
	<p class="text-fg-muted">{hint}</p>
	{#if page.error?.requestId}
		<p class="text-xs text-fg-faint">Код запроса: {page.error.requestId}</p>
	{/if}
	<Button href={resolve('/')}>На главную</Button>
</main>
