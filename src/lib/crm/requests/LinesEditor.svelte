<script lang="ts">
	import { Button, Combobox, NumberInput, Select } from '$lib/ui';
	import type { OptionKind } from '$lib/types/catalog';
	import type { CrmRequestVariantChoice } from '$lib/types/crm-request';
	import { MAX_CREATE_LINES } from '$lib/validation/crm-request';

	/*
	 * Lines of the creation form. The fields go out as index-aligned hidden inputs of our own: a
	 * select without a value may drop its input, and the server would pair a colour with a wrong line.
	 */
	let { variants }: { variants: readonly CrmRequestVariantChoice[] } = $props();

	interface Line {
		readonly key: number;
		variantId: string;
		optionId: string;
		glossOptionId: string;
		qty: number;
	}

	let counter = 0;
	const blank = (): Line => ({
		key: (counter += 1),
		variantId: '',
		optionId: '',
		glossOptionId: '',
		qty: 1
	});
	let lines = $state<Line[]>([blank()]);

	const variantOptions = $derived(
		variants.map((variant) => ({
			value: String(variant.id),
			label: `${variant.sku} · ${variant.productTitle}, ${variant.sizeCode}, ${variant.materialTitle}`
		}))
	);

	function optionsOf(variantId: string, kind: OptionKind, empty: string) {
		const variant = variants.find((candidate) => String(candidate.id) === variantId);
		return [
			{ value: '', label: empty },
			...(variant?.options ?? [])
				.filter((option) => option.kind === kind)
				.map((option) => ({
					value: String(option.id),
					label: option.title
				}))
		];
	}
</script>

<div class="flex flex-col gap-4" data-testid="request-lines">
	{#each lines as line, index (line.key)}
		<div
			class="grid gap-3 rounded-inset bg-surface-muted p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_1fr_1fr_6rem_auto]"
		>
			<Combobox
				label={index === 0 ? 'Позиция' : undefined}
				options={variantOptions}
				placeholder="Выберите позицию"
				bind:value={
					() => line.variantId,
					(value) => {
						line.variantId = value;
						line.optionId = '';
					}
				}
			/>
			<Select
				label={index === 0 ? 'Цвет' : undefined}
				options={optionsOf(line.variantId, 'color', 'Без цвета')}
				placeholder="Выберите цвет"
				bind:value={line.optionId}
			/>
			<Select
				label={index === 0 ? 'Блеск' : undefined}
				options={optionsOf(line.variantId, 'gloss', 'Без указания')}
				placeholder="Выберите блеск"
				bind:value={line.glossOptionId}
			/>
			<NumberInput
				label={index === 0 ? 'Штук' : undefined}
				min={1}
				max={999}
				placeholder="Введите количество"
				bind:value={line.qty}
			/>
			<input type="hidden" name="variantId" value={line.variantId} />
			<input type="hidden" name="optionId" value={line.optionId} />
			<input type="hidden" name="glossOptionId" value={line.glossOptionId} />
			<input type="hidden" name="qty" value={line.qty} />
			<Button
				variant="ghost"
				class="self-end"
				disabled={lines.length === 1}
				onclick={() => (lines = lines.filter((candidate) => candidate.key !== line.key))}
			>
				Убрать
			</Button>
		</div>
	{/each}
	<Button
		variant="secondary"
		class="self-start"
		disabled={lines.length >= MAX_CREATE_LINES}
		onclick={() => (lines = [...lines, blank()])}
	>
		Добавить позицию
	</Button>
</div>
