<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import CookieNotice from '$lib/legal/CookieNotice.svelte';
	import { BrandMark, Button, Card, ErrorState, Input } from '$lib/ui';
	import { PLACEHOLDER } from '$lib/utils/placeholders';
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

<svelte:head><title>Вход в портал · Ангел</title></svelte:head>

<main class="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
	<!-- The only way back to the public site from the form. -->
	<a href={resolve('/')} class="flex items-center gap-2.5 self-center rounded-sm hover:text-link">
		<BrandMark class="size-9" />
		<span class="font-heading text-2xl font-semibold tracking-[0.14em]">АНГЕЛ</span>
	</a>
	<Card.Root class="px-6">
		<h1 class="text-2xl font-semibold">Вход в систему</h1>

		{#if notice}
			<p class="rounded-sm bg-surface-muted p-4 text-sm">{notice}</p>
		{/if}

		<form method="POST" use:enhance class="flex flex-col gap-4">
			<input type="hidden" name="redirectTo" value={data.redirectTo} />

			<Input
				name="email"
				type="email"
				label="Электронная почта"
				placeholder={PLACEHOLDER.email}
				autocomplete="username"
				required
				value={form?.email ?? ''}
			/>

			<Input
				name="password"
				type="password"
				label="Пароль"
				placeholder="Введите пароль"
				autocomplete="current-password"
				required
			/>

			{#if form?.formError}
				<div data-testid="form-error">
					<ErrorState title={form.formError} />
				</div>
			{/if}

			<Button type="submit">Войти</Button>
			<p class="text-xs text-fg-muted">
				Входя, вы принимаете
				<a class="underline" href={resolve('/legal/terms')}>пользовательское соглашение</a>
				и
				<a class="underline" href={resolve('/legal/personal-data')}
					>политику обработки персональных данных</a
				>.
			</p>
		</form>

		<a href={resolve('/password/reset')} class="text-sm text-fg-muted underline">Забыли пароль?</a>
	</Card.Root>
</main>

<CookieNotice />
