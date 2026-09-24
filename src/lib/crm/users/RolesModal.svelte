<script lang="ts">
	import { enhance } from '$app/forms';
	import { CRM_ROLE_OPTIONS } from '$lib/crm/labels';
	import { Button, Checkbox, Modal, withToast } from '$lib/ui';
	import type { CrmUserDto } from '$lib/types/crm';

	let {
		user,
		onClose
	}: {
		/** The account being edited; null keeps the dialog closed. */
		user: CrmUserDto | null;
		onClose: () => void;
	} = $props();

	let pending = $state(false);
</script>

<Modal
	open={user !== null}
	title={user ? `Роли: ${user.fullName}` : 'Роли'}
	description="Доступ к разделам CRM складывается из всех отмеченных ролей."
	{onClose}
>
	{#snippet body()}
		{#if user}
			<form
				method="POST"
				action="?/roles"
				class="flex flex-col gap-4"
				use:enhance={withToast({
					pending: (value) => (pending = value),
					success: 'Роли сохранены',
					onSuccess: onClose
				})}
			>
				<input type="hidden" name="id" value={user.id} />
				<fieldset class="flex flex-col gap-2">
					<legend class="sr-only">Роли</legend>
					{#each CRM_ROLE_OPTIONS as role (role.value)}
						<Checkbox
							name="roles"
							value={role.value}
							label={role.label}
							checked={user.roles.includes(role.value)}
						/>
					{/each}
				</fieldset>
				<Button type="submit" loading={pending} class="self-start">Сохранить роли</Button>
			</form>
		{/if}
	{/snippet}
</Modal>
