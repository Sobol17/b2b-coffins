<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import PricePair from '$lib/portal/PricePair.svelte';
	import { Button, Card, NumberInput, Select, withToast, type SelectOption } from '$lib/ui';
	import type { OptionKind, ProductDto } from '$lib/types/catalog';
	import type { ContactDto } from '$lib/types/counterparty';
	import type { DraftItemDto } from '$lib/types/request';
	import { formatMinor } from '$lib/utils/format';
	import DraftLineCounter from './DraftLineCounter.svelte';

	/*
	 * Choice of size and options by the compatibility matrix, sent to the draft request. The page
	 * only offers valid picks; the server checks the combination again when the line arrives (P4).
	 */
	let {
		product,
		selectedId = $bindable(null),
		manager,
		draftLines,
		formError
	}: {
		product: ProductDto;
		selectedId?: number | null;
		manager: ContactDto | null;
		draftLines: readonly DraftItemDto[];
		formError?: string | undefined;
	} = $props();

	const KIND_TEXT: Readonly<Record<OptionKind, { label: string; placeholder: string }>> = {
		color: { label: 'Цвет', placeholder: 'Выберите цвет' }
	};

	let chosen = $state<Partial<Record<OptionKind, string>>>({});
	let qty = $state(1);
	let pending = $state(false);

	const variant = $derived(
		product.variants.find((item) => item.id === selectedId) ?? product.variants[0]
	);
	const sizeOptions = $derived<SelectOption[]>(
		product.variants.map((item) => ({
			value: String(item.id),
			label: `${item.sizeCode} · ${item.materialTitle}`
		}))
	);
	const groups = $derived.by(() => {
		const kinds = [...new Set((variant?.options ?? []).map((option) => option.kind))];
		return kinds.map((kind) => {
			const own = (variant?.options ?? []).filter((option) => option.kind === kind);
			return {
				kind,
				defaultValue: String(own.find((option) => option.isDefault)?.id ?? own[0]?.id ?? ''),
				options: own.map((option): SelectOption => ({
					value: String(option.id),
					// A surcharge is money: it is only there for a role that received it.
					label:
						option.priceDeltaMinor === undefined || option.priceDeltaMinor === 0
							? option.title
							: `${option.title} (+${formatMinor(option.priceDeltaMinor)} ₽)`
				}))
			};
		});
	});
	const inStock = $derived((variant?.stockQty ?? 0) > 0);
	// The line of exactly this size and these options, matched the way the draft merges lines.
	const line = $derived.by(() => {
		const picked = groups.map((group) => Number(valueOf(group))).sort((a, b) => a - b);
		return draftLines.find(
			(item) =>
				item.variantId === variant?.id &&
				item.options.length === picked.length &&
				item.options
					.map((option) => option.id)
					.sort((a, b) => a - b)
					.every((id, index) => id === picked[index])
		);
	});

	function valueOf(group: {
		kind: OptionKind;
		defaultValue: string;
		options: SelectOption[];
	}): string {
		const picked = chosen[group.kind];
		// A pick made for another size may not exist in the matrix of this one.
		return picked !== undefined && group.options.some((option) => option.value === picked)
			? picked
			: group.defaultValue;
	}
</script>

<Card.Root class="lg:sticky lg:top-28">
	<Card.Content class="flex flex-col gap-5">
		<div>
			<div class="text-xs tracking-[0.08em] text-fg-faint">{variant?.sku ?? product.sku}</div>
			<h1 class="mt-2 text-3xl sm:text-4xl">{product.title}</h1>
			<p class="mt-2 text-fg-muted">
				{[product.categoryTitle, `типоразмеров: ${product.variants.length}`]
					.filter((part) => part !== null)
					.join(' · ')}
			</p>
		</div>

		<div
			data-testid="product-page-price"
			class="flex items-baseline gap-2.5 border-b border-border pb-4"
		>
			<span class="font-heading text-4xl font-semibold">
				<PricePair agencyMinor={product.agencyPriceMinor} purchaseMinor={variant?.priceMinor} />
			</span>
			{#if product.agencyPriceMinor !== undefined || variant?.priceMinor !== undefined}
				<span class="text-sm text-fg-faint">за штуку</span>
			{/if}
		</div>

		<div data-testid="product-page-stock" class="rounded-inset bg-surface-muted p-4">
			<div class="text-xs text-fg-faint">На складе</div>
			<div class={['font-heading text-xl font-semibold', inStock && 'text-brand']}>
				{inStock ? `${variant?.stockQty} шт` : 'Нет в наличии'}
			</div>
		</div>

		<form
			method="POST"
			action="?/add"
			class="flex flex-col gap-5"
			use:enhance={withToast({
				reset: false,
				pending: (value) => (pending = value),
				success: {
					title: 'Позиция добавлена в заявку',
					description: product.title,
					action: { label: 'Перейти в заявку', href: resolve('/portal/cart') }
				}
			})}
		>
			{#if sizeOptions.length > 0}
				<Select
					label="Размер"
					placeholder="Выберите размер"
					options={sizeOptions}
					bind:value={() => String(variant?.id ?? ''), (next) => (selectedId = Number(next))}
				/>
			{/if}

			{#each groups as group (group.kind)}
				<Select
					label={KIND_TEXT[group.kind].label}
					placeholder={KIND_TEXT[group.kind].placeholder}
					options={group.options}
					bind:value={() => valueOf(group), (next) => (chosen = { ...chosen, [group.kind]: next })}
				/>
				<input type="hidden" name="option" value={valueOf(group)} />
			{/each}

			{#if variant && !line}
				<input type="hidden" name="variantId" value={variant.id} />
				<!-- Wraps on a narrow phone: the pill button never shrinks below its label. -->
				<div class="flex flex-wrap items-end gap-3">
					<div class="w-28">
						<NumberInput
							name="qty"
							label="Количество"
							placeholder="Введите количество"
							min={1}
							max={999}
							bind:value={qty}
						/>
					</div>
					<Button
						type="submit"
						size="lg"
						class="min-w-48 flex-1"
						loading={pending}
						data-testid="add-to-draft"
					>
						Добавить в заявку
					</Button>
				</div>
			{/if}

			{#if formError}
				<p data-testid="add-error" class="text-sm text-danger">{formError}</p>
			{/if}
		</form>

		{#if line}
			<DraftLineCounter {line} />
		{/if}

		{#if manager}
			<p class="border-t border-border pt-4 text-sm text-fg-muted">
				Менеджер мастерской<br />
				<span class="text-fg">{manager.fullName}</span>{#if manager.phone}
					· {manager.phone}{/if}
			</p>
		{/if}
	</Card.Content>
</Card.Root>
