<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import ProductPhoto from '$lib/portal/catalog/ProductPhoto.svelte';
	import { Button, PriceCell } from '$lib/ui';
	import type { DraftDto } from '$lib/types/request';
	import { MAX_LINE_QTY } from '$lib/validation/request';

	let { draft }: { draft: DraftDto } = $props();
</script>

<div class="rounded-card bg-surface-raised p-5 sm:p-7">
	<div class="flex flex-col divide-y divide-border">
		{#each draft.items as item (item.id)}
			<div
				data-testid="draft-line"
				class="grid grid-cols-[4.5rem_1fr_auto] items-center gap-x-4 gap-y-3 py-4 sm:grid-cols-[5.5rem_1fr_auto_auto]"
			>
				<ProductPhoto mediaId={item.coverMediaId} alt="" caption="фото" class="aspect-square" />
				<div>
					<div class="text-xs tracking-[0.08em] text-fg-faint">{item.sku}</div>
					<a
						href={resolve(`/portal/catalog/product/${item.productId}`)}
						class="font-heading text-lg font-semibold hover:text-brand"
					>
						{item.productTitle}
					</a>
					<div class="text-sm text-fg-muted">
						{[
							item.materialTitle,
							`размер ${item.sizeCode}`,
							...item.options.map((option) => option.title)
						].join(' · ')}
					</div>
					<div data-testid="line-total" class="mt-2 font-heading text-xl font-semibold">
						<PriceCell valueMinor={item.lineTotalMinor} />
						{#if item.lineTotalMinor !== undefined}₽{/if}
					</div>
				</div>

				<form method="POST" action="?/remove" use:enhance class="justify-self-end sm:order-last">
					<input type="hidden" name="itemId" value={item.id} />
					<Button
						type="submit"
						variant="ghost"
						size="sm"
						class="w-9.5 px-0 text-fg-muted"
						aria-label="Удалить позицию {item.productTitle}"
					>
						×
					</Button>
				</form>

				<div
					class="col-span-3 flex items-center justify-between gap-3 sm:col-span-1 sm:justify-end"
				>
					<span class="text-sm text-fg-muted">
						<PriceCell valueMinor={item.unitPriceMinor} />
						{#if item.unitPriceMinor !== undefined}₽ за шт{/if}
					</span>
					<form
						method="POST"
						action="?/qty"
						use:enhance
						class="flex items-center gap-1 rounded-pill bg-surface-muted p-1"
					>
						<input type="hidden" name="itemId" value={item.id} />
						<Button
							type="submit"
							variant="ghost"
							size="sm"
							class="w-9.5 px-0 text-fg"
							name="qty"
							value={String(item.qty - 1)}
							disabled={item.qty <= 1}
							aria-label="Уменьшить количество"
						>
							−
						</Button>
						<span data-testid="line-qty" class="min-w-10 text-center tabular-nums">{item.qty}</span>
						<Button
							type="submit"
							variant="ghost"
							size="sm"
							class="w-9.5 px-0 text-fg"
							name="qty"
							value={String(item.qty + 1)}
							disabled={item.qty >= MAX_LINE_QTY}
							aria-label="Увеличить количество"
						>
							+
						</Button>
					</form>
				</div>
			</div>
		{/each}
	</div>

	<div class="flex flex-wrap gap-2.5 pt-5">
		<Button variant="secondary" href={resolve('/portal/catalog')}>← Продолжить подбор</Button>
		<form method="POST" action="?/clear" use:enhance class="sm:ml-auto">
			<Button type="submit" variant="ghost" class="text-fg-muted">Очистить</Button>
		</form>
	</div>
</div>
