<script lang="ts">
	import { enhance } from '$app/forms';
	import { roubles } from '$lib/crm/payroll/labels';
	import { Button, DatePicker, Input, Modal, MoneyInput, Textarea, withToast } from '$lib/ui';

	/* A transfer to the fund. The server refuses an amount above the remainder. */
	let {
		open = $bindable(),
		today,
		remainderMinor
	}: { open: boolean; today: string; remainderMinor: number } = $props();

	let pending = $state(false);
</script>

<Modal
	bind:open
	title="Перечисление в фонд"
	description={`К перечислению: ${roubles(remainderMinor)}`}
	onClose={() => (open = false)}
>
	{#snippet body()}
		<form
			method="POST"
			action="?/transfer"
			class="flex flex-col gap-4"
			use:enhance={withToast({
				pending: (value) => (pending = value),
				success: 'Перечисление записано',
				onSuccess: () => (open = false)
			})}
		>
			<MoneyInput name="amountMinor" label="Сумма, ₽" placeholder="Введите сумму" required />
			<DatePicker
				name="transferredOn"
				label="Дата перечисления"
				placeholder="Выберите дату"
				value={today}
			/>
			<Input name="documentRef" label="Документ" placeholder="Введите номер" maxlength={100} />
			<Textarea
				name="comment"
				label="Комментарий"
				placeholder="Введите комментарий"
				rows={2}
				maxlength={500}
			/>
			<Button type="submit" loading={pending} class="self-start">Записать</Button>
		</form>
	{/snippet}
</Modal>
