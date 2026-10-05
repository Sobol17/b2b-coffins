<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Input, Modal, MoneyInput, withToast } from '$lib/ui';
	import type { WorkTypeDto } from '$lib/types/crm-payroll';

	/* One dialog for a new work and for an edit of one: a title and the price of a unit. */
	let {
		open,
		work,
		onClose
	}: {
		open: boolean;
		/** Null for a new work. */
		work: WorkTypeDto | null;
		onClose: () => void;
	} = $props();

	let pending = $state(false);
</script>

<Modal
	{open}
	title={work ? 'Изменить работу' : 'Новая работа'}
	description="Новая стоимость действует на дни, которые отметят после правки."
	{onClose}
>
	{#snippet body()}
		<form
			method="POST"
			action={work ? '?/update' : '?/create'}
			class="flex flex-col gap-4"
			use:enhance={withToast({
				pending: (value) => (pending = value),
				success: work ? 'Работа сохранена' : 'Работа добавлена',
				onSuccess: onClose
			})}
		>
			{#if work}<input type="hidden" name="id" value={work.id} />{/if}
			<Input
				name="title"
				label="Название работы"
				placeholder="Введите название"
				value={work?.title ?? ''}
				required
				maxlength={120}
			/>
			<MoneyInput
				name="rateMinor"
				label="Стоимость за единицу, ₽"
				placeholder="Введите стоимость"
				valueMinor={work?.rateMinor ?? 0}
				required
			/>
			<Button type="submit" loading={pending} class="self-start">
				{work ? 'Сохранить' : 'Добавить'}
			</Button>
		</form>
	{/snippet}
</Modal>
