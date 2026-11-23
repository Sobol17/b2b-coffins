<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Combobox, Input, Modal, MoneyInput, Select, withToast } from '$lib/ui';
	import { WORK_ROLE_OPTIONS } from './labels';
	import type { WorkTypeDto } from '$lib/types/crm-payroll';

	/* One dialog for a new work and for an edit of one: a title, the role and the price of a unit. */
	let {
		open,
		work,
		variants,
		formError,
		onClose
	}: {
		open: boolean;
		/** Null for a new work. */
		work: WorkTypeDto | null;
		variants: readonly { id: number; label: string }[];
		formError?: string | undefined;
		onClose: () => void;
	} = $props();

	let pending = $state(false);
	const variantOptions = $derived([
		{ value: '', label: 'Без привязки к позиции' },
		...variants.map((variant) => ({ value: String(variant.id), label: variant.label })),
		...(work?.variantId && !variants.some((variant) => variant.id === work.variantId)
			? [{ value: String(work.variantId), label: work.variantLabel ?? 'Недоступная позиция' }]
			: [])
	]);
</script>

<Modal
	{open}
	title={work ? 'Изменить работу' : 'Новая работа'}
	description="Новая стоимость действует на следующие работы. Уже выполненные сохраняют прежнюю расценку."
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
			{#if formError}
				<p role="alert" data-testid="work-type-error" class="text-sm text-danger">{formError}</p>
			{/if}
			<Input
				name="title"
				label="Название работы"
				placeholder="Введите название"
				value={work?.title ?? ''}
				required
				maxlength={120}
			/>
			<Select
				name="roleCode"
				label="Роль"
				placeholder="Выберите роль"
				options={WORK_ROLE_OPTIONS}
				value={work?.roleCode ?? ''}
			/>
			<div
				class="min-w-0 [&_button]:h-auto [&_button]:min-h-11 [&_button]:py-2 [&_button]:text-left [&_button]:whitespace-normal"
			>
				<Combobox
					name="variantId"
					label="Позиция каталога"
					placeholder="Выберите позицию"
					options={variantOptions}
					value={String(work?.variantId ?? '')}
					hint="Без привязки работа остаётся для ручного ввода."
				/>
			</div>
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
		{#if work}
			<form
				method="POST"
				action={work.isActive ? '?/disable' : '?/enable'}
				use:enhance={withToast({
					success: work.isActive ? 'Работа выключена' : 'Работа включена',
					onSuccess: onClose
				})}
				class="mt-4"
			>
				<input type="hidden" name="id" value={work.id} />
				<Button type="submit" variant="secondary"
					>{work.isActive ? 'Выключить работу' : 'Включить работу'}</Button
				>
			</form>
		{/if}
	{/snippet}
</Modal>
