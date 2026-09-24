<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Card, ConfirmDialog, EmptyState, withToast } from '$lib/ui';
	import type { CrmDeliveryAddressDto } from '$lib/types/crm-counterparty';
	import AddressModal from './AddressModal.svelte';
	import DeleteForm from './DeleteForm.svelte';

	let { addresses }: { addresses: readonly CrmDeliveryAddressDto[] } = $props();

	let editing = $state<CrmDeliveryAddressDto | null>(null);
	let modalOpen = $state(false);
	let removing = $state<CrmDeliveryAddressDto | null>(null);
	let deleteForm = $state<DeleteForm>();

	function open(address: CrmDeliveryAddressDto | null): void {
		editing = address;
		modalOpen = true;
	}
</script>

<Card.Root>
	<Card.Header class="flex flex-row flex-wrap items-center gap-3">
		<div class="flex-1">
			<Card.Title>Адреса доставки</Card.Title>
			<Card.Description>Из них контрагент выбирает адрес в корзине.</Card.Description>
		</div>
		<Button variant="secondary" onclick={() => open(null)}>Добавить адрес</Button>
	</Card.Header>
	<Card.Content>
		{#if addresses.length === 0}
			<EmptyState title="Адресов пока нет" />
		{:else}
			<ul class="flex flex-col gap-2" data-testid="addresses">
				{#each addresses as address (address.id)}
					<li class="flex flex-wrap items-center gap-3 rounded-inset bg-surface-muted px-4 py-3">
						<span class="flex-1">
							{address.title}{address.isDefault ? ' · по умолчанию' : ''}
							<span class="block text-sm text-fg-muted">
								{address.address}{address.contactName
									? ` · ${address.contactName}`
									: ''}{address.contactPhone ? ` · ${address.contactPhone}` : ''}
							</span>
						</span>
						{#if !address.isDefault}
							<form
								method="POST"
								action="?/addressDefault"
								use:enhance={withToast({ success: 'Адрес по умолчанию выбран' })}
							>
								<input type="hidden" name="id" value={address.id} />
								<Button type="submit" variant="ghost" size="sm">По умолчанию</Button>
							</form>
						{/if}
						<Button variant="ghost" size="sm" onclick={() => open(address)}>Изменить</Button>
						<Button
							variant="ghost"
							size="sm"
							class="text-danger"
							onclick={() => (removing = address)}
						>
							Удалить
						</Button>
					</li>
				{/each}
			</ul>
		{/if}
	</Card.Content>
</Card.Root>

<AddressModal bind:open={modalOpen} address={editing} />
<DeleteForm
	bind:this={deleteForm}
	action="?/addressDelete"
	id={removing?.id}
	success="Адрес удалён"
/>
<ConfirmDialog
	open={removing !== null}
	title="Удалить адрес?"
	description="Отправленные заявки сохранят этот адрес, в корзине он больше не появится."
	confirmLabel="Удалить"
	danger
	onConfirm={() => deleteForm?.submit()}
	onClose={() => (removing = null)}
/>
