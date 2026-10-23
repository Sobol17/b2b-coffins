<script lang="ts">
	import { enhance } from '$app/forms';
	import { FINANCE_KIND_TITLE } from '$lib/crm/finance/labels';
	import { FINANCE_COMMENT_MAX, FINANCE_KINDS, type FinanceOperationDto } from '$lib/types/finance';
	import { Button, DatePicker, MoneyInput, RadioGroup, Textarea, withToast } from '$lib/ui';

	/*
	 * One form for a new entry and for an edit. Expenses come first: the owner books them far more
	 * often than income, the payments of requests arrive by themselves.
	 */
	let {
		today,
		entry = null,
		onDone
	}: {
		today: string;
		/** A manual line of the feed to edit; null for a new entry. */
		entry?: FinanceOperationDto | null;
		onDone?: () => void;
	} = $props();

	const KINDS = [...FINANCE_KINDS].reverse().map((value) => ({
		value,
		label: FINANCE_KIND_TITLE[value]
	}));
	// Writable derived: the fields follow a new entry and stay editable until the form is sent.
	let kind = $derived<string>(entry?.kind ?? 'expense');
	let amountMinor = $derived(entry ? Math.abs(entry.signedMinor) : 0);
	let occurredOn = $derived(entry?.occurredOn ?? today);
	let comment = $derived(entry?.title ?? '');
	let pending = $state(false);

	function cleared(): void {
		amountMinor = 0;
		comment = '';
		onDone?.();
	}
</script>

<form
	method="POST"
	action={entry ? '?/update' : '?/create'}
	class="grid gap-4 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] md:items-start"
	data-testid={entry ? 'finance-edit-form' : 'finance-form'}
	use:enhance={withToast({
		pending: (value) => (pending = value),
		success: entry ? 'Операция изменена' : 'Операция добавлена',
		reset: false,
		onSuccess: cleared
	})}
>
	{#if entry?.manualId}
		<input type="hidden" name="id" value={entry.manualId} />
	{/if}
	<RadioGroup name="kind" label="Тип" options={KINDS} bind:value={kind} required />
	<MoneyInput
		name="amountMinor"
		label="Сумма, ₽"
		placeholder="Введите сумму"
		bind:valueMinor={amountMinor}
		blankZero
		required
	/>
	<DatePicker name="occurredOn" label="Дата" placeholder="Выберите дату" bind:value={occurredOn} />
	<div class="md:col-span-3">
		<Textarea
			name="comment"
			label="Комментарий"
			placeholder="Введите комментарий"
			rows={2}
			maxlength={FINANCE_COMMENT_MAX}
			bind:value={comment}
			required
		/>
	</div>
	<Button type="submit" loading={pending} class="justify-self-start">
		{entry ? 'Сохранить' : 'Добавить'}
	</Button>
</form>
