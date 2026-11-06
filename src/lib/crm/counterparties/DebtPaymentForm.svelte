<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { PAYMENT_METHOD_TITLE } from '$lib/crm/labels';
	import {
		Button,
		Modal,
		DatePicker,
		MoneyInput,
		Select,
		Textarea,
		withToast,
		type ToastSpec
	} from '$lib/ui';
	import { PAYMENT_METHODS } from '$lib/types/crm-counterparty';
	import { formatMinor, isoDay } from '$lib/utils/format';

	/*
	 * A payment against the whole debt (tech.md v1.65). The server spreads it over the waiting
	 * requests and closes them only when the debt is gone; the form only collects the money.
	 */
	let {
		debtMinor,
		timeZone,
		onClose,
		onPendingChange,
		formError
	}: {
		debtMinor: number;
		timeZone: string;
		onClose: () => void;
		onPendingChange: (pending: boolean) => void;
		formError?: string | undefined;
	} = $props();

	const METHODS = PAYMENT_METHODS.map((value) => ({ value, label: PAYMENT_METHOD_TITLE[value] }));

	// The untouched field sends the debt with its kopecks; a typed amount is whole rubles.
	let amountMinor = $derived(debtMinor);
	let method = $state<string>('bank');
	let paidAt = $derived(isoDay(new Date().toISOString(), timeZone));
	let saving = $state(false);

	// Close after SvelteKit updates focus; pending belongs to the page even if this dialog closes.
	const submitPayment: SubmitFunction = async (input) => {
		onPendingChange(true);
		const finish = await withToast({
			reset: false,
			pending: (value) => (saving = value),
			success: paidToast
		})(input);
		return async (event) => {
			try {
				if (finish) await finish(event);
				if (event.result.type === 'success') onClose();
			} finally {
				onPendingChange(false);
			}
		};
	};

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

<Modal
	open
	title="Оплата долга"
	description={`Текущий долг: ${formatMinor(debtMinor)} ₽. Оплата разносится по заявкам от старой доставки к новой. Заявки закроются после погашения всего долга.`}
	{onClose}
>
	{#snippet body()}
		<form
			data-testid="debt-payment"
			method="POST"
			action="?/pay"
			class="grid gap-4 sm:grid-cols-2"
			use:enhance={submitPayment}
		>
			{#if formError}<p role="alert" class="text-sm text-danger sm:col-span-2">{formError}</p>{/if}
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
			<div class="flex flex-wrap gap-3 sm:col-span-2">
				<Button type="submit" loading={saving}>Внести оплату</Button>
				<Button type="button" variant="secondary" disabled={saving} onclick={onClose}>Отмена</Button
				>
			</div>
		</form>
	{/snippet}
</Modal>
