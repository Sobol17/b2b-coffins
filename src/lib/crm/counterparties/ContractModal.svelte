<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, DatePicker, Input, Modal, withToast } from '$lib/ui';
	import type { CrmContractDto } from '$lib/types/crm-counterparty';
	import { isoDay } from '$lib/utils/format';

	/** `contract` null adds a new one; the dates are calendar days of the workshop zone. */
	let {
		open = $bindable(false),
		contract,
		timeZone
	}: { open?: boolean; contract: CrmContractDto | null; timeZone: string } = $props();

	const day = (iso: string | null | undefined) => (iso ? isoDay(iso, timeZone) : '');
</script>

<Modal bind:open title={contract ? 'Договор' : 'Новый договор'}>
	{#snippet body()}
		{#key contract}
			<form
				method="POST"
				action={contract ? '?/contractUpdate' : '?/contractAdd'}
				class="flex flex-col gap-4"
				use:enhance={withToast({
					success: contract ? 'Договор сохранён' : 'Договор добавлен',
					onSuccess: () => (open = false)
				})}
			>
				{#if contract}<input type="hidden" name="id" value={contract.id} />{/if}
				<Input
					name="number"
					label="Номер договора"
					placeholder="Введите номер"
					value={contract?.number ?? ''}
					required
				/>
				<DatePicker name="signedAt" label="Подписан" value={day(contract?.signedAt)} />
				<DatePicker name="validUntil" label="Действует до" value={day(contract?.validUntil)} />
				<Button type="submit" class="self-start">Сохранить договор</Button>
			</form>
		{/key}
	{/snippet}
</Modal>
