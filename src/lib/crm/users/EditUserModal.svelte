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
		resetError,
		onClose
	}: {
		user: CrmUserDto | null;
		errors?: Partial<Record<Field, string[]>> | undefined;
		formError?: string | undefined;
		resetError?: string | undefined;
		onClose: () => void;
	} = $props();

	let pending = $state(false);
	let resetting = $state(false);
</script>

<Modal
	open={user !== null}
	title="Изменить пользователя"
	description="Контакты и роли сохраняются вместе. Доступ складывается из всех отмеченных ролей."
	{onClose}
>
	{#snippet body()}
		<div class="max-h-[calc(100dvh-14rem)] overflow-y-auto">
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
						<p role="alert" data-testid="edit-user-error" class="text-sm text-danger">
							{formError}
						</p>
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
						<Button type="submit" loading={pending} disabled={resetting}>Сохранить изменения</Button
						>
						<Button
							type="button"
							variant="secondary"
							disabled={pending || resetting}
							onclick={onClose}>Отмена</Button
						>
					</div>
				</form>
				{#if !user.isSelf}
					<form
						method="POST"
						action="?/reset"
						class="mt-6 flex flex-col gap-3 border-t border-border pt-4"
						use:enhance={withToast({
							pending: (value) => (resetting = value),
							success: 'Новый пароль сгенерирован',
							onSuccess: onClose
						})}
					>
						<input type="hidden" name="id" value={user.id} />
						<p class="text-sm text-fg-muted">
							Сброс завершит все сеансы пользователя. Новый пароль появится в отдельном окне.
							Несохранённые изменения формы не применятся.
						</p>
						{#if resetError}<p role="alert" class="text-sm text-danger">{resetError}</p>{/if}
						<Button
							type="submit"
							variant="secondary"
							class="self-start"
							loading={resetting}
							disabled={pending}>Сбросить пароль</Button
						>
					</form>
				{/if}
			{/if}
		</div>
	{/snippet}
</Modal>
