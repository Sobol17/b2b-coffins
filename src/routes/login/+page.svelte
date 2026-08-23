<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Button, Card, ErrorState, Input } from '$lib/ui';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const notice = $derived(
		page.url.searchParams.has('changed')
			? 'Пароль изменён. Войдите заново.'
			: page.url.searchParams.has('reset')
				? 'Пароль восстановлен. Войдите заново.'
				: null
	);
</script>

<svelte:head><title>Вход</title></svelte:head>

<main class="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
	<h1 class="text-2xl font-semibold">Вход в систему</h1>

	{#if notice}
		<Card.Root><Card.Content class="text-sm">{notice}</Card.Content></Card.Root>
	{/if}

	<form method="POST" use:enhance class="flex flex-col gap-4">
		<input type="hidden" name="redirectTo" value={data.redirectTo} />

		<Input
			name="email"
			type="email"
			label="Электронная почта"
			autocomplete="username"
			required
			value={form?.email ?? ''}
		/>

		<Input
			name="password"
			type="password"
			label="Пароль"
			autocomplete="current-password"
			required
		/>

		{#if form?.formError}
			<div data-testid="form-error">
				<ErrorState title={form.formError} />
			</div>
		{/if}

		<Button type="submit">Войти</Button>
	</form>

	<a href={resolve('/password/reset')} class="text-sm text-fg-muted underline">Забыли пароль?</a>
</main>
