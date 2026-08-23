<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const fields = [
		{ name: 'currentPassword', label: 'Текущий пароль', autocomplete: 'current-password' },
		{ name: 'newPassword', label: 'Новый пароль', autocomplete: 'new-password' },
		{ name: 'repeatPassword', label: 'Повторите новый пароль', autocomplete: 'new-password' }
	] as const;
</script>

<svelte:head><title>Смена пароля</title></svelte:head>

<main class="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
	<h1 class="text-2xl font-semibold">Смена пароля</h1>

	{#if data.mustChange}
		<p data-testid="must-change" class="rounded-[--radius-card] bg-surface-muted p-3 text-sm">
			Пароль выдан временно. Задайте свой, чтобы продолжить работу.
		</p>
	{/if}

	<form method="POST" use:enhance class="flex flex-col gap-4">
		{#each fields as field (field.name)}
			<label class="flex flex-col gap-1">
				<span class="text-sm text-fg-muted">{field.label}</span>
				<input
					name={field.name}
					type="password"
					autocomplete={field.autocomplete}
					required
					class="rounded-[--radius-card] border border-border px-3 py-2"
				/>
				{#if form?.errors?.[field.name]}
					<span class="text-sm text-danger">{form.errors[field.name]?.join(', ')}</span>
				{/if}
			</label>
		{/each}

		{#if form?.formError}
			<p data-testid="form-error" class="text-sm text-danger">{form.formError}</p>
		{/if}

		<button type="submit" class="rounded-[--radius-card] bg-brand px-4 py-2 text-white">
			Сохранить
		</button>
	</form>
</main>
