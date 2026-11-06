<script lang="ts">
	import { enhance } from '$app/forms';
	import { CRM_ROLE_OPTIONS } from '$lib/crm/labels';
	import { Button, Checkbox, Input, Modal, withToast } from '$lib/ui';
	import type { CrmUserDto } from '$lib/types/crm';
	import { PLACEHOLDER } from '$lib/utils/placeholders';

	type Field = 'fullName' | 'email' | 'phone' | 'roles';

	let {
		user,
		errors,
		formError,
		onClose
	}: {
		user: CrmUserDto | null;
		errors?: Partial<Record<Field, string[]>> | undefined;
		formError?: string | undefined;
		onClose: () => void;
	} = $props();

	let pending = $state(false);
</script>

<Modal
	open={user !== null}
	title="Изменить пользователя"
	description="Контакты и роли сохраняются вместе. Доступ складывается из всех отмеченных ролей."
	{onClose}
>
	{#snippet body()}
		{#if user}
			<form
				method="POST"
				action="?/update"
				class="flex flex-col gap-4"
				use:enhance={withToast({
					pending: (value) => (pending = value),
					success: 'Пользователь изменён',
					onSuccess: onClose
				})}
			>
				<input type="hidden" name="id" value={user.id} />
				{#if formError}
					<p role="alert" data-testid="edit-user-error" class="text-sm text-danger">{formError}</p>
				{/if}
				<Input
					name="fullName"
					label="Имя и фамилия"
					placeholder={PLACEHOLDER.fullName}
					value={user.fullName}
					required
					autocomplete="off"
					error={errors?.fullName?.join(', ')}
				/>
				<Input
					name="email"
					type="email"
					label="Электронная почта"
					placeholder={PLACEHOLDER.email}
					value={user.email}
					required
					autocomplete="off"
					error={errors?.email?.join(', ')}
				/>
				<Input
					name="phone"
					type="tel"
					label="Телефон"
					placeholder={PLACEHOLDER.phone}
					value={user.phone ?? ''}
					error={errors?.phone?.join(', ')}
				/>
				<fieldset class="flex flex-col gap-2">
					<legend class="mb-2 text-sm font-medium">Роли</legend>
					{#each CRM_ROLE_OPTIONS as role (role.value)}
						<Checkbox
							name="roles"
							value={role.value}
							label={role.label}
							checked={user.roles.includes(role.value)}
						/>
					{/each}
					{#if user.isSelf}
						<p class="text-sm text-fg-muted">Снять с себя роль руководителя нельзя.</p>
					{/if}
					{#if errors?.roles}
						<p role="alert" class="text-sm text-danger">{errors.roles.join(', ')}</p>
					{/if}
				</fieldset>
				<div class="flex flex-wrap gap-2">
					<Button type="submit" loading={pending}>Сохранить изменения</Button>
					<Button type="button" variant="secondary" disabled={pending} onclick={onClose}
						>Отмена</Button
					>
				</div>
			</form>
		{/if}
	{/snippet}
</Modal>
