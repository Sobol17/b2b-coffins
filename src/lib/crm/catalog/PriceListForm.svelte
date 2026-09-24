<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Checkbox, DatePicker, Input, withToast } from '$lib/ui';
	import type { CrmPriceListDto } from '$lib/types/crm-catalog';

	let { list, onDone }: { list: CrmPriceListDto | null; onDone: () => void } = $props();
</script>

<form
	method="POST"
	action={list ? '?/updateList' : '?/createList'}
	class="grid gap-4 sm:grid-cols-2"
	use:enhance={withToast({
		success: list ? 'Прайс-лист сохранён' : 'Прайс-лист добавлен',
		onSuccess: onDone
	})}
>
	{#if list}<input type="hidden" name="id" value={list.id} />{/if}
	<Input
		name="title"
		label="Название прайс-листа"
		placeholder="Введите название"
		value={list?.title ?? ''}
		required
	/>
	<div class="flex items-end">
		<Checkbox
			name="isBase"
			value="true"
			label="Базовый прайс-лист"
			checked={list?.isBase ?? false}
		/>
	</div>
	<DatePicker name="validFrom" label="Начало действия" value={list?.validFrom ?? ''} />
	<DatePicker name="validTo" label="Конец действия" value={list?.validTo ?? ''} />
	<div class="flex items-end gap-2">
		<Button type="submit">{list ? 'Сохранить' : 'Добавить'}</Button>
		{#if list}<Button variant="secondary" onclick={onDone}>Отмена</Button>{/if}
	</div>
</form>
