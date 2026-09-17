<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { Button, Card, ErrorState, Input } from '$lib/ui';
	import { PLACEHOLDER } from '$lib/utils/placeholders';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>Восстановление доступа</title></svelte:head>

<main class="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
	<h1 class="text-2xl font-semibold">Восстановление доступа</h1>

	{#if data.token}
		<form method="POST" action="?/apply" use:enhance class="flex flex-col gap-4">
			<input type="hidden" name="token" value={data.token} />

			<Input
				name="newPassword"
				type="password"
				label="Новый пароль"
				placeholder="Введите новый пароль"
				autocomplete="new-password"
				required
			/>
			<Input
				name="repeatPassword"
				type="password"
				label="Повторите пароль"
				placeholder="Повторите пароль"
				autocomplete="new-password"
				required
			/>

			{#if form?.formError}
				<div data-testid="form-error"><ErrorState title={form.formError} /></div>
			{/if}

			<Button type="submit">Сохранить пароль</Button>
		</form>
	{:else if form?.sent}
		<Card.Root>
			<Card.Content data-testid="reset-sent" class="text-sm">
				Если такой адрес зарегистрирован, письмо со ссылкой уже отправлено.
			</Card.Content>
		</Card.Root>
	{:else}
		<form method="POST" action="?/request" use:enhance class="flex flex-col gap-4">
			<Input
				name="email"
				type="email"
				label="Электронная почта"
				placeholder={PLACEHOLDER.email}
				autocomplete="username"
				required
			/>

			{#if form?.formError}
				<div data-testid="form-error"><ErrorState title={form.formError} /></div>
			{/if}

			<Button type="submit">Отправить ссылку</Button>
		</form>
	{/if}

	<a href={resolve('/login')} class="text-sm text-fg-muted underline">Вернуться ко входу</a>
</main>
