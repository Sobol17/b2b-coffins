<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Input, Modal, Select, withToast, type ToastSpec } from '$lib/ui';
	import { PLACEHOLDER } from '$lib/utils/placeholders';
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

	// The password card on the page carries the details; the toast only says whether mail went out.
	function created(data: Record<string, unknown> | undefined): ToastSpec {
		const answer = data?.['created'];
		const mailSent =
			typeof answer === 'object' &&
			answer !== null &&
			'mailSent' in answer &&
			answer.mailSent === true;
		return mailSent
			? { title: 'Доступ создан', description: 'Письмо с паролем ушло сотруднику' }
			: {
					kind: 'warning',
					title: 'Доступ создан, письмо не ушло',
					description: 'Передайте временный пароль сотруднику сами'
				};
	}
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
			use:enhance={withToast({
				pending: (value) => (pending = value),
				success: created,
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
			<Select
				name="role"
				label="Роль"
				placeholder="Выберите роль"
				options={ROLE_OPTIONS}
				bind:value={role}
				required
			/>

			{#if formError}
				<p data-testid="create-error" class="text-sm text-danger">{formError}</p>
			{/if}

			<Button type="submit" loading={pending} class="self-start">Создать доступ</Button>
		</form>
	{/snippet}
</Modal>
