<script lang="ts">
	import { enhance } from '$app/forms';
	import { roubles } from '$lib/crm/payroll/labels';
	import { Button, Modal, Textarea, withToast } from '$lib/ui';
	import type { CharityTransferDto } from '$lib/types/crm-reports';

	/* Cancels a transfer with a row of the opposite sign: the original stays in the registry. */
	let {
		transfer,
		onClose
	}: {
		/** Null keeps the dialog closed. */
		transfer: CharityTransferDto | null;
		onClose: () => void;
	} = $props();

	let pending = $state(false);
</script>

<Modal
	open={transfer !== null}
	title="Сторно перечисления"
	description={transfer ? `${transfer.transferredOn}: ${roubles(transfer.amountMinor)}` : undefined}
	{onClose}
>
	{#snippet body()}
		{#if transfer}
			<form
				method="POST"
				action="?/reverse"
				class="flex flex-col gap-4"
				use:enhance={withToast({
					pending: (value) => (pending = value),
					success: 'Перечисление сторнировано',
					onSuccess: onClose
				})}
			>
				<input type="hidden" name="transferId" value={transfer.id} />
				<Textarea
					name="comment"
					label="Причина сторно"
					placeholder="Введите причину"
					rows={2}
					maxlength={500}
					required
				/>
				<Button type="submit" variant="danger" loading={pending} class="self-start">
					Сторнировать
				</Button>
			</form>
		{/if}
	{/snippet}
</Modal>
