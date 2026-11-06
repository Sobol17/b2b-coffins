<script lang="ts">
	import { enhance } from '$app/forms';
	import { TouchButton, withToast } from '$lib/ui';
	import type { ShopUnitDto } from '$lib/types/crm-shop';
	let { unit, open }: { unit: ShopUnitDto; open: boolean } = $props();
	let pending = $state(false);
</script>

<li
	data-testid="shop-unit"
	data-unit-id={unit.id}
	class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
>
	<div class="min-w-0">
		<p class="font-medium">Ящик №{unit.id}</p>
		<p class="text-sm text-fg-muted">
			{#if unit.isLegacyDone}Сделано вручную
			{:else if unit.completedAt}Выполнено · {unit.takenByName}
			{:else if unit.takenByName}В работе: {unit.takenByName}
			{:else}Свободен{/if}
		</p>
	</div>
	{#if open && (unit.canTake || unit.canComplete)}
		<form
			method="POST"
			action={unit.canTake ? '?/takeUnit' : '?/completeUnit'}
			use:enhance={withToast({
				pending: (value) => (pending = value),
				success: unit.canTake
					? 'Изделие в работе'
					: 'Работа выполнена, начисление ожидает подтверждения'
			})}
		>
			<input type="hidden" name="unitId" value={unit.id} />
			<TouchButton type="submit" variant={unit.canTake ? 'secondary' : 'primary'} loading={pending}>
				{unit.canTake ? 'Взять в работу' : 'Выполнено'}
			</TouchButton>
		</form>
	{/if}
</li>
