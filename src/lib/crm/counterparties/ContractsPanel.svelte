<script lang="ts">
	import { Button, Card, ConfirmDialog, EmptyState } from '$lib/ui';
	import type { CrmContractDto } from '$lib/types/crm-counterparty';
	import { formatDate } from '$lib/utils/format';
	import ContractModal from './ContractModal.svelte';
	import DeleteForm from './DeleteForm.svelte';

	let { contracts, timeZone }: { contracts: readonly CrmContractDto[]; timeZone: string } =
		$props();

	let editing = $state<CrmContractDto | null>(null);
	let modalOpen = $state(false);
	let removing = $state<CrmContractDto | null>(null);
	let confirmOpen = $state(false);
	let deleteForm = $state<DeleteForm>();

	function askRemove(row: NonNullable<typeof removing>): void {
		removing = row;
		confirmOpen = true;
	}

	// The dialog's confirm button does not close it: the panel posts the form and closes it here.
	function confirmRemove(): void {
		deleteForm?.submit();
		confirmOpen = false;
	}

	function open(contract: CrmContractDto | null): void {
		editing = contract;
		modalOpen = true;
	}
	const day = (iso: string | null) => (iso ? formatDate(iso, timeZone) : '—');
</script>

<Card.Root>
	<Card.Header class="flex flex-row flex-wrap items-center gap-3">
		<div class="flex-1">
			<Card.Title>Договоры</Card.Title>
			<Card.Description
				>Портал показывает контрагенту последний по дате подписания.</Card.Description
			>
		</div>
		<Button variant="secondary" onclick={() => open(null)}>Добавить договор</Button>
	</Card.Header>
	<Card.Content>
		{#if contracts.length === 0}
			<EmptyState title="Договоров пока нет" />
		{:else}
			<ul class="flex flex-col gap-2" data-testid="contracts">
				{#each contracts as contract (contract.id)}
					<li class="flex flex-wrap items-center gap-3 rounded-inset bg-surface-muted px-4 py-3">
						<span class="flex-1">
							№ {contract.number}
							<span class="text-sm text-fg-muted">
								· подписан {day(contract.signedAt)} · до {day(contract.validUntil)}
							</span>
						</span>
						<Button variant="ghost" size="sm" onclick={() => open(contract)}>Изменить</Button>
						<Button
							variant="ghost"
							size="sm"
							class="text-danger"
							onclick={() => askRemove(contract)}
						>
							Удалить
						</Button>
					</li>
				{/each}
			</ul>
		{/if}
	</Card.Content>
</Card.Root>

<ContractModal bind:open={modalOpen} contract={editing} {timeZone} />
<DeleteForm
	bind:this={deleteForm}
	action="?/contractDelete"
	id={removing?.id}
	success="Договор удалён"
/>
<ConfirmDialog
	bind:open={confirmOpen}
	title="Удалить договор?"
	description={removing
		? `Договор № ${removing.number} исчезнет из карточки и портала.`
		: undefined}
	confirmLabel="Удалить"
	danger
	onConfirm={confirmRemove}
/>
