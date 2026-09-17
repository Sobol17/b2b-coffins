<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { Button, withToast } from '$lib/ui';
	import type { DraftItemDto } from '$lib/types/request';
	import { MAX_LINE_QTY } from '$lib/validation/request';

	/*
	 * The picked size is already in the draft: the page changes that line instead of adding another.
	 * Going below one piece removes the line, and the page offers "Добавить в заявку" again.
	 */
	let { line }: { line: DraftItemDto } = $props();

	const removes = $derived(line.qty <= 1);
</script>

<div data-testid="draft-line-counter" class="flex flex-col gap-2">
	<span class="text-sm text-fg-muted">В заявке</span>
	<div class="flex flex-wrap items-center gap-3">
		<form
			method="POST"
			action="?/qty"
			use:enhance={withToast({
				reset: false,
				success: (data) =>
					data?.['removed']
						? { title: 'Позиция удалена из заявки', description: line.productTitle }
						: null
			})}
			class="flex h-13 items-center gap-1 rounded-pill bg-surface-muted p-1"
		>
			<input type="hidden" name="itemId" value={line.id} />
			<Button
				type="submit"
				variant="ghost"
				class="w-11 px-0 text-fg"
				name="qty"
				value={String(line.qty - 1)}
				formaction={removes ? '?/remove' : undefined}
				aria-label={removes ? 'Удалить из заявки' : 'Уменьшить количество'}
				data-testid="counter-minus"
			>
				−
			</Button>
			<span data-testid="counter-qty" class="min-w-12 text-center text-lg tabular-nums">
				{line.qty}
			</span>
			<Button
				type="submit"
				variant="ghost"
				class="w-11 px-0 text-fg"
				name="qty"
				value={String(line.qty + 1)}
				disabled={line.qty >= MAX_LINE_QTY}
				aria-label="Увеличить количество"
				data-testid="counter-plus"
			>
				+
			</Button>
		</form>
		<Button variant="secondary" size="lg" class="min-w-48 flex-1" href={resolve('/portal/cart')}>
			Перейти в заявку
		</Button>
	</div>
</div>
