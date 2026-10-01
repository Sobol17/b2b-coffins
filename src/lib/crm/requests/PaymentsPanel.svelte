<script lang="ts">
	import { enhance } from '$app/forms';
	import { PAYMENT_METHOD_TITLE } from '$lib/crm/labels';
	import {
		Button,
		Card,
		DatePicker,
		Modal,
		MoneyInput,
		PriceCell,
		Select,
		Textarea,
		TONE_CLASS,
		withToast
	} from '$lib/ui';
	import { isReversible } from '$lib/domain/payment/mark';
	import { PAYMENT_METHODS, type CrmPaymentMarkDto } from '$lib/types/crm-counterparty';
	import type { CrmRequestCardDto } from '$lib/types/crm-request';
	import { formatDate, isoDay } from '$lib/utils/format';

	/**
	 * Payment marks of the card (C7, tech.md v1.44). The manager marks the money, the system moves
	 * the status; a mistake is cancelled by a reversal, the mark itself stays in the list.
	 */
	let { card, timeZone }: { card: CrmRequestCardDto; timeZone: string } = $props();

	const METHODS = PAYMENT_METHODS.map((value) => ({ value, label: PAYMENT_METHOD_TITLE[value] }));

	const marks = $derived(card.payments ?? []);
	const dueMinor = $derived(card.dueMinor ?? 0);
	// The untouched field sends the rest with its kopecks; a typed amount is whole rubles.
	let amountMinor = $derived(dueMinor);
	let method = $state<string>('bank');
	let paidAt = $derived(isoDay(new Date().toISOString(), timeZone));
	let reversing = $state<CrmPaymentMarkDto | null>(null);
	let reverseOpen = $state(false);

	const canReverse = (mark: CrmPaymentMarkDto) =>
		card.canMarkPayment && isReversible(mark, card.status);
</script>

<Card.Root data-testid="request-payments">
	<Card.Header><Card.Title>Оплата</Card.Title></Card.Header>
	<Card.Content class="flex flex-col gap-4">
		<dl class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
			<dt class="text-fg-muted">К оплате</dt>
			<dd class="text-end"><PriceCell valueMinor={card.totalMinor} /></dd>
			<dt class="text-fg-muted">Оплачено</dt>
			<dd class="text-end" data-testid="payments-paid">
				<PriceCell valueMinor={card.paidMinor} />
			</dd>
			<dt class="font-medium">Остаток</dt>
			<dd class="text-end font-medium" data-testid="payments-due">
				<PriceCell valueMinor={dueMinor} />
			</dd>
		</dl>

		{#if marks.length > 0}
			<ul class="flex flex-col gap-2" data-testid="payment-marks">
				{#each marks as mark (mark.id)}
					<li class="rounded-inset bg-surface-muted px-4 py-2 text-sm">
						<div class="flex flex-wrap items-baseline justify-between gap-2">
							<span class={mark.isReversed ? 'text-fg-muted line-through' : 'font-medium'}>
								<PriceCell valueMinor={mark.amountMinor} />
							</span>
							<span class="text-xs text-fg-muted">
								{formatDate(mark.paidAt, timeZone)} · {PAYMENT_METHOD_TITLE[mark.method]} ·
								{mark.createdByName}
							</span>
						</div>
						{#if mark.reversalOfId !== null || mark.isReversed}
							<span class={['rounded-pill px-2 py-0.5 text-xs', TONE_CLASS.warning]}>
								{mark.reversalOfId !== null ? 'Сторно' : 'Сторнирована'}
							</span>
						{/if}
						{#if mark.comment}<div class="text-fg-muted">{mark.comment}</div>{/if}
						{#if canReverse(mark)}
							<Button
								variant="ghost"
								size="sm"
								class="-ms-2 text-danger"
								onclick={() => {
									reversing = mark;
									reverseOpen = true;
								}}
							>
								Сторнировать
							</Button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		{#if card.canMarkPayment}
			<form
				method="POST"
				action="?/pay"
				class="flex flex-col gap-3"
				use:enhance={withToast({ success: 'Оплата отмечена' })}
			>
				<MoneyInput
					name="amountMinor"
					label="Сумма, ₽"
					placeholder="Введите сумму"
					required
					bind:valueMinor={amountMinor}
				/>
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
				<Button type="submit" class="self-start">Отметить оплату</Button>
			</form>
		{:else if card.status !== 'paid'}
			<p class="text-sm text-fg-muted">Оплату отмечают после доставки заявки.</p>
		{/if}
	</Card.Content>
</Card.Root>

<Modal bind:open={reverseOpen} title="Сторнировать отметку">
	{#snippet body()}
		<form
			method="POST"
			action="?/reversePayment"
			class="flex flex-col gap-4"
			use:enhance={withToast({
				success: 'Отметка сторнирована',
				onSuccess: () => (reverseOpen = false)
			})}
		>
			<input type="hidden" name="markId" value={reversing?.id} />
			<p class="text-sm text-fg-muted">
				Отметка останется в списке, рядом появится строка с обратной суммой.
			</p>
			<Textarea
				name="comment"
				label="Причина"
				placeholder="Введите причину"
				maxlength={500}
				required
			/>
			<Button type="submit" variant="danger" class="self-start">Сторнировать</Button>
		</form>
	{/snippet}
</Modal>
