<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>Восстановление доступа</title></svelte:head>

<main class="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
	<h1 class="text-2xl font-semibold">Восстановление доступа</h1>

	{#if data.token}
		<form method="POST" action="?/apply" use:enhance class="flex flex-col gap-4">
			<input type="hidden" name="token" value={data.token} />

			<label class="flex flex-col gap-1">
				<span class="text-sm text-fg-muted">Новый пароль</span>
				<input
					name="newPassword"
					type="password"
					autocomplete="new-password"
					required
					class="rounded-[--radius-card] border border-border px-3 py-2"
				/>
			</label>

			<label class="flex flex-col gap-1">
				<span class="text-sm text-fg-muted">Повторите пароль</span>
				<input
					name="repeatPassword"
					type="password"
					autocomplete="new-password"
					required
					class="rounded-[--radius-card] border border-border px-3 py-2"
				/>
			</label>

			{#if form?.formError}
				<p data-testid="form-error" class="text-sm text-danger">{form.formError}</p>
			{/if}

			<button type="submit" class="rounded-[--radius-card] bg-brand px-4 py-2 text-white">
				Сохранить пароль
			</button>
		</form>
	{:else if form?.sent}
		<p data-testid="reset-sent" class="rounded-[--radius-card] bg-surface-muted p-3 text-sm">
			Если такой адрес зарегистрирован, письмо со ссылкой уже отправлено.
		</p>
	{:else}
		<form method="POST" action="?/request" use:enhance class="flex flex-col gap-4">
			<label class="flex flex-col gap-1">
				<span class="text-sm text-fg-muted">Электронная почта</span>
				<input
					name="email"
					type="email"
					autocomplete="username"
					required
					class="rounded-[--radius-card] border border-border px-3 py-2"
				/>
			</label>

			{#if form?.formError}
				<p data-testid="form-error" class="text-sm text-danger">{form.formError}</p>
			{/if}

			<button type="submit" class="rounded-[--radius-card] bg-brand px-4 py-2 text-white">
				Отправить ссылку
			</button>
		</form>
	{/if}

	<a href={resolve('/login')} class="text-sm text-fg-muted underline">Вернуться ко входу</a>
</main>
