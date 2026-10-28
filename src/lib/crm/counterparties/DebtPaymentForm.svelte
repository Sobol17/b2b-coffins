<script lang="ts">
	import { enhance } from '$app/forms';
	import { PAYMENT_METHOD_TITLE } from '$lib/crm/labels';
	import {
		Button,
		Card,
		DatePicker,
		MoneyInput,
		Select,
		Textarea,
		withToast,
		type ToastSpec
	} from '$lib/ui';
	import { PAYMENT_METHODS } from '$lib/types/crm-counterparty';
	import { isoDay } from '$lib/utils/format';

	/*
	 * A payment against the whole debt (tech.md v1.65). The server spreads it over the waiting
	 * requests and closes them only when the debt is gone; the form only collects the money.
	 */
	let { debtMinor, timeZone }: { debtMinor: number; timeZone: string } = $props();

	const METHODS = PAYMENT_METHODS.map((value) => ({ value, label: PAYMENT_METHOD_TITLE[value] }));

	// The untouched field sends the debt with its kopecks; a typed amount is whole rubles.
	let amountMinor = $derived(debtMinor);
	let method = $state<string>('bank');
	let paidAt = $derived(isoDay(new Date().toISOString(), timeZone));
	let saving = $state(false);

	function paidToast(data: Record<string, unknown> | undefined): ToastSpec {
		const result = data?.['result'];
		const { requestCount = 0, closedCount = 0 } =
			typeof result === 'object' && result !== null
				? (result as { requestCount?: number; closedCount?: number })
				: {};
		return {
			title: 'Оплата внесена',
			description:
				closedCount > 0
					? `Долг погашен, закрыто заявок: ${closedCount}.`
					: `Разнесено по заявкам: ${requestCount}. Заявки закроются после погашения всего долга.`
		};
	}
</script>

<Card.Root data-testid="debt-payment">
	<Card.Header>
		<Card.Title>Оплата долга</Card.Title>
		<Card.Description>
			Оплата разносится по заявкам от старой доставки к новой. Заявки перейдут в «Оплачено», когда
			контрагент погасит весь долг.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<form
			method="POST"
			action="?/pay"
			class="grid gap-4 sm:grid-cols-2"
			use:enhance={withToast({
				reset: false,
				pending: (value) => (saving = value),
				success: paidToast
			})}
		>
			<!-- A new debt after a payment redraws the field with the new rest. -->
			{#key debtMinor}
				<MoneyInput
					name="amountMinor"
					label="Сумма, ₽"
					placeholder="Введите сумму"
					required
					bind:valueMinor={amountMinor}
				/>
			{/key}
			<DatePicker name="paidAt" label="Дата оплаты" required bind:value={paidAt} />
			<Select
				label="Способ"
				options={METHODS}
				placeholder="Выберите способ"
				required
				bind:value={method}
			/>
			<input type="hidden" name="method" value={method} />
			<Textarea
				name="comment"
				label="Комментарий"
				placeholder="Введите комментарий"
				maxlength={500}
			/>
			<Button type="submit" class="self-start" loading={saving}>Внести оплату</Button>
		</form>
	</Card.Content>
</Card.Root>
