<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Modal, withToast } from '$lib/ui';
	import type { CrmUserDto } from '$lib/types/crm';

	let {
		user,
		formError,
		onClose
	}: {
		user: CrmUserDto | null;
		formError?: string | undefined;
		onClose: () => void;
	} = $props();

	let pending = $state(false);
</script>

<Modal
	open={user !== null}
	title="Удалить пользователя?"
	description="Учётная запись исчезнет из списка, доступ на всех устройствах будет закрыт. Работы, выплаты и журнал сохранятся."
	{onClose}
>
	{#snippet body()}
		{#if user}
			<form
				method="POST"
				action="?/delete"
				class="flex flex-col gap-4"
				use:enhance={withToast({
					pending: (value) => (pending = value),
					success: 'Пользователь удалён',
					onSuccess: onClose
				})}
			>
				<input type="hidden" name="id" value={user.id} />
				<p class="font-medium">{user.fullName}</p>
				{#if formError}
					<p role="alert" data-testid="delete-user-error" class="text-sm text-danger">
						{formError}
					</p>
				{/if}
				<div class="flex flex-wrap gap-2">
					<Button type="button" variant="secondary" disabled={pending} onclick={onClose}
						>Отмена</Button
					>
					<Button type="submit" variant="danger" loading={pending}>Удалить пользователя</Button>
				</div>
			</form>
		{/if}
	{/snippet}
</Modal>
