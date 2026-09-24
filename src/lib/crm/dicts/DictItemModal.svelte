<script lang="ts">
	import { enhance } from '$app/forms';
	import { DICT_TITLE } from '$lib/crm/labels';
	import { Button, Input, Modal, NumberInput, withToast } from '$lib/ui';
	import type { DictItemDto } from '$lib/types/crm';
	import type { DictCode } from '$lib/types/dicts';

	type Field = 'code' | 'title' | 'sortOrder';

	/*
	 * One dialog for both a new item and an edit. The code is fixed once created: seeds and imports
	 * find the item by it, so an edit shows it read-only.
	 */
	let {
		open,
		dict,
		item,
		errors,
		formError,
		onClose
	}: {
		open: boolean;
		dict: DictCode;
		/** Null for a new item. */
		item: DictItemDto | null;
		errors?: Partial<Record<Field, string[]>> | undefined;
		formError?: string | undefined;
		onClose: () => void;
	} = $props();

	let pending = $state(false);
</script>

<Modal
	{open}
	title={item ? 'Изменить запись' : `Новая запись: ${DICT_TITLE[dict]}`}
	description={item ? undefined : 'Код пишется латиницей и после создания не меняется.'}
	{onClose}
>
	{#snippet body()}
		<form
			method="POST"
			action={item ? '?/update' : '?/create'}
			class="flex flex-col gap-4"
			use:enhance={withToast({
				pending: (value) => (pending = value),
				success: item ? 'Запись сохранена' : 'Запись добавлена',
				onSuccess: onClose
			})}
		>
			{#if item}
				<input type="hidden" name="id" value={item.id} />
				<Input label="Код" placeholder="Введите код" value={item.code} readonly />
			{:else}
				<input type="hidden" name="dict" value={dict} />
				<Input
					name="code"
					label="Код"
					placeholder="Введите код"
					required
					maxlength={40}
					error={errors?.code?.join(', ')}
				/>
			{/if}
			<Input
				name="title"
				label="Название"
				placeholder="Введите название"
				value={item?.title ?? ''}
				required
				error={errors?.title?.join(', ')}
			/>
			<NumberInput
				name="sortOrder"
				label="Порядок в списке"
				placeholder="Введите число"
				value={item?.sortOrder ?? 0}
				min={0}
				max={100000}
				error={errors?.sortOrder?.join(', ')}
			/>
			{#if formError}
				<p data-testid="dict-error" class="text-sm text-danger">{formError}</p>
			{/if}
			<Button type="submit" loading={pending} class="self-start">
				{item ? 'Сохранить' : 'Добавить'}
			</Button>
		</form>
	{/snippet}
</Modal>
