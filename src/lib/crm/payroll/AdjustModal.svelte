<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Modal, MoneyInput, RadioGroup, Textarea, withToast } from '$lib/ui';
	import type { PayrollLineDto } from '$lib/types/crm-payroll';
	import { roubles } from './labels';

	/* A signed correction of one worker's week. Zero clears it. */
	let {
		line,
		week,
		onClose
	}: {
		/** Null keeps the dialog closed. */
		line: PayrollLineDto | null;
		week: string;
		onClose: () => void;
	} = $props();

	let pending = $state(false);
	const options = [
		{ value: 'plus', label: 'Доплата' },
		{ value: 'minus', label: 'Удержание' }
	];
</script>

<Modal
	open={line !== null}
	title="Корректировка"
	description={line ? `${line.fullName}: начислено ${roubles(line.accruedMinor)}` : undefined}
	{onClose}
>
	{#snippet body()}
		{#if line}
			<form
				method="POST"
				action="?/adjust"
				class="flex flex-col gap-4"
				use:enhance={withToast({
					pending: (value) => (pending = value),
					success: 'Корректировка сохранена',
					onSuccess: onClose
				})}
			>
				<input type="hidden" name="week" value={week} />
				<input type="hidden" name="staffId" value={line.staffId} />
				<RadioGroup
					name="direction"
					label="Вид"
					{options}
					value={line.adjustmentMinor < 0 ? 'minus' : 'plus'}
					required
				/>
				<MoneyInput
					name="amountMinor"
					label="Сумма, ₽"
					hint="Ноль убирает корректировку"
					placeholder="Введите сумму"
					valueMinor={Math.abs(line.adjustmentMinor)}
					required
				/>
				<Textarea
					name="comment"
					label="Комментарий"
					placeholder="Введите причину"
					value={line.adjustmentComment ?? ''}
					rows={2}
					maxlength={500}
				/>
				<Button type="submit" loading={pending} class="self-start">Сохранить</Button>
			</form>
		{/if}
	{/snippet}
</Modal>
