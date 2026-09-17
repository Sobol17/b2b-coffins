<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Card, ErrorState, Input, withToast } from '$lib/ui';
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
		<Card.Root>
			<Card.Content data-testid="must-change" class="text-sm">
				Пароль выдан временно. Задайте свой, чтобы продолжить работу.
			</Card.Content>
		</Card.Root>
	{/if}

	<form method="POST" use:enhance={withToast()} class="flex flex-col gap-4">
		{#each fields as field (field.name)}
			<Input
				name={field.name}
				type="password"
				label={field.label}
				autocomplete={field.autocomplete}
				required
				error={form?.errors?.[field.name]?.join(', ')}
			/>
		{/each}

		{#if form?.formError}
			<div data-testid="form-error">
				<ErrorState title={form.formError} />
			</div>
		{/if}

		<Button type="submit">Сохранить</Button>
	</form>
</main>
