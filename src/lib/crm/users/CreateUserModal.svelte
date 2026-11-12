<script lang="ts">
	import { enhance } from '$app/forms';
	import RolePicker from './RolePicker.svelte';
	import { Button, Input, Modal, withToast } from '$lib/ui';
	import { PLACEHOLDER } from '$lib/utils/placeholders';

	type Field = 'fullName' | 'email' | 'phone' | 'roles';

	let {
		open = $bindable(false),
		errors,
		formError
	}: {
		open?: boolean;
		errors?: Partial<Record<Field, string[]>> | undefined;
		formError?: string | undefined;
	} = $props();

	let pending = $state(false);
</script>

<Modal
	bind:open
	title="Новый пользователь"
	description="Временный пароль уйдёт на почту и один раз появится на этой странице."
>
	{#snippet body()}
		<form
			method="POST"
			action="?/create"
			class="flex flex-col gap-4"
			use:enhance={withToast({
				pending: (value) => (pending = value),
				success: 'Пользователь создан',
				onSuccess: () => (open = false)
			})}
		>
			<Input
				name="fullName"
				label="Имя и фамилия"
				placeholder={PLACEHOLDER.fullName}
				required
				autocomplete="off"
				error={errors?.fullName?.join(', ')}
			/>
			<Input
				name="email"
				type="email"
				label="Электронная почта"
				placeholder={PLACEHOLDER.email}
				required
				autocomplete="off"
				error={errors?.email?.join(', ')}
			/>
			<Input
				name="phone"
				type="tel"
				label="Телефон"
				placeholder={PLACEHOLDER.phone}
				error={errors?.phone?.join(', ')}
			/>
			<RolePicker error={errors?.roles?.join(', ')} />

			{#if formError}
				<p data-testid="create-error" class="text-sm text-danger">{formError}</p>
			{/if}

			<Button type="submit" loading={pending} class="self-start">Создать пользователя</Button>
		</form>
	{/snippet}
</Modal>
