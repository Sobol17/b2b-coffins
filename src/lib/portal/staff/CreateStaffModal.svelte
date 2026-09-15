<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Input, Modal, Select } from '$lib/ui';
	import { ROLE_OPTIONS } from './labels';

	type Field = 'fullName' | 'email' | 'phone' | 'role';

	let {
		open = $bindable(false),
		errors,
		formError
	}: {
		open?: boolean;
		errors?: Partial<Record<Field, string[]>> | undefined;
		formError?: string | undefined;
	} = $props();

	let role = $state('cp_employee');
	let pending = $state(false);
</script>

<Modal
	bind:open
	title="Новый сотрудник"
	description="Временный пароль уйдёт на почту сотрудника и один раз появится на этой странице."
>
	{#snippet body()}
		<form
			method="POST"
			action="?/create"
			class="flex flex-col gap-4"
			use:enhance={() => {
				pending = true;
				return async ({ result, update }) => {
					pending = false;
					await update();
					if (result.type === 'success') open = false;
				};
			}}
		>
			<Input
				name="fullName"
				label="Имя и фамилия"
				required
				autocomplete="off"
				error={errors?.fullName?.join(', ')}
			/>
			<Input
				name="email"
				type="email"
				label="Электронная почта"
				required
				autocomplete="off"
				error={errors?.email?.join(', ')}
			/>
			<Input name="phone" type="tel" label="Телефон" error={errors?.phone?.join(', ')} />
			<Select name="role" label="Роль" options={ROLE_OPTIONS} bind:value={role} required />

			{#if formError}
				<p data-testid="create-error" class="text-sm text-danger">{formError}</p>
			{/if}

			<Button type="submit" loading={pending} class="self-start">Создать доступ</Button>
		</form>
	{/snippet}
</Modal>
