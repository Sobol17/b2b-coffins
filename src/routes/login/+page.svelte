<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
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
		<p class="rounded-[--radius-card] bg-surface-muted p-3 text-sm">{notice}</p>
	{/if}

	<form method="POST" use:enhance class="flex flex-col gap-4">
		<input type="hidden" name="redirectTo" value={data.redirectTo} />

		<label class="flex flex-col gap-1">
			<span class="text-sm text-fg-muted">Электронная почта</span>
			<input
				name="email"
				type="email"
				autocomplete="username"
				required
				value={form?.email ?? ''}
				class="rounded-[--radius-card] border border-border px-3 py-2"
			/>
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-sm text-fg-muted">Пароль</span>
			<input
				name="password"
				type="password"
				autocomplete="current-password"
				required
				class="rounded-[--radius-card] border border-border px-3 py-2"
			/>
		</label>

		{#if form?.formError}
			<p data-testid="form-error" class="text-sm text-danger">{form.formError}</p>
		{/if}

		<button type="submit" class="rounded-[--radius-card] bg-brand px-4 py-2 text-white">
			Войти
		</button>
	</form>

	<a href={resolve('/password/reset')} class="text-sm text-fg-muted underline">Забыли пароль?</a>
</main>
