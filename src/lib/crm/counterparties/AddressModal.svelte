<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Checkbox, Input, Modal, withToast } from '$lib/ui';
	import type { CrmDeliveryAddressDto } from '$lib/types/crm-counterparty';
	import { PLACEHOLDER } from '$lib/utils/placeholders';

	let {
		open = $bindable(false),
		address
	}: { open?: boolean; address: CrmDeliveryAddressDto | null } = $props();
</script>

<Modal bind:open title={address ? 'Адрес доставки' : 'Новый адрес доставки'}>
	{#snippet body()}
		{#key address}
			<form
				method="POST"
				action={address ? '?/addressUpdate' : '?/addressAdd'}
				class="flex flex-col gap-4"
				use:enhance={withToast({
					success: address ? 'Адрес сохранён' : 'Адрес добавлен',
					onSuccess: () => (open = false)
				})}
			>
				{#if address}<input type="hidden" name="id" value={address.id} />{/if}
				<Input
					name="title"
					label="Название"
					placeholder="Введите название"
					value={address?.title ?? ''}
					required
				/>
				<Input
					name="address"
					label="Адрес"
					placeholder="Введите адрес"
					value={address?.address ?? ''}
					required
				/>
				<Input
					name="contactName"
					label="Контактное лицо"
					placeholder={PLACEHOLDER.fullName}
					value={address?.contactName ?? ''}
				/>
				<Input
					name="contactPhone"
					type="tel"
					label="Телефон контакта"
					placeholder={PLACEHOLDER.phone}
					value={address?.contactPhone ?? ''}
				/>
				<Checkbox
					name="isDefault"
					label="Адрес по умолчанию"
					checked={address?.isDefault ?? false}
				/>
				<Button type="submit" class="self-start">Сохранить адрес</Button>
			</form>
		{/key}
	{/snippet}
</Modal>
