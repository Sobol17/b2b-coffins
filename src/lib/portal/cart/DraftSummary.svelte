<script lang="ts">
	import { Button, PriceCell } from '$lib/ui';
	import type { DraftDto } from '$lib/types/request';

	let { draft, formId }: { draft: DraftDto; formId: string } = $props();
</script>

<aside
	data-testid="draft-summary"
	class="rounded-card bg-surface-raised p-6 sm:p-8 lg:sticky lg:top-28"
>
	<h2 class="mb-4 text-2xl">Итог</h2>

	<dl class="flex flex-col text-[0.9375rem]">
		<div class="flex justify-between py-2">
			<dt class="text-fg-muted">Позиций</dt>
			<dd>{draft.items.length}</dd>
		</div>
		<div class="flex justify-between py-2">
			<dt class="text-fg-muted">Изделий</dt>
			<dd>{draft.unitCount} шт</dd>
		</div>
		{#if draft.itemsTotalMinor !== undefined}
			<div class="flex justify-between py-2">
				<dt class="text-fg-muted">Сумма</dt>
				<dd><PriceCell valueMinor={draft.itemsTotalMinor} /> ₽</dd>
			</div>
			<div data-testid="draft-discount" class="flex justify-between py-2">
				<dt class="text-fg-muted">Скидка по договору {draft.discountPercent ?? 0} %</dt>
				<dd class="text-link">−<PriceCell valueMinor={draft.discountMinor} /> ₽</dd>
			</div>
		{/if}
	</dl>

	<div class="flex items-baseline justify-between border-t border-border py-4">
		<span>К оплате</span>
		<span data-testid="draft-total" class="font-heading text-3xl font-semibold">
			<PriceCell valueMinor={draft.totalMinor} />
			{#if draft.totalMinor !== undefined}₽{/if}
		</span>
	</div>

	<p class="mb-4 text-xs text-fg-faint">
		Цены фиксирует менеджер мастерской, когда принимает заявку в работу.
	</p>

	<Button
		type="submit"
		form={formId}
		size="lg"
		class="w-full"
		data-testid="submit-draft"
		disabled={draft.items.length === 0}
	>
		Оформить заявку
	</Button>
</aside>
