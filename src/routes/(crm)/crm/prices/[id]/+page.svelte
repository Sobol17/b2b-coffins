<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { Button, Card, MoneyInput, Select, withToast } from '$lib/ui';
	import { formatMinor } from '$lib/utils/format';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const variants = $derived(
		data.variants.map((row) => ({
			value: String(row.id),
			label: `${row.productTitle} · ${row.sku}`
		}))
	);
</script>

<svelte:head><title>{data.list.title} · CRM</title></svelte:head>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
	<div>
		<a href={resolve('/crm/prices')} class="text-sm text-link">← Прайсы и скидки</a>
		<h1 class="mt-2 text-3xl">{data.list.title}</h1>
	</div>
	<Card.Root
		><Card.Content class="flex flex-col gap-4">
			<h2 class="text-2xl">Цена варианта</h2>
			{#if variants.length === 0}<p class="text-fg-muted">Сначала добавьте вариант модели.</p>{/if}
			<form
				method="POST"
				action="?/upsert"
				class="grid gap-4 sm:grid-cols-2"
				use:enhance={withToast({ success: 'Цена сохранена' })}
			>
				<Select
					name="variantId"
					label="Вариант"
					placeholder="Выберите вариант"
					options={variants}
					required
				/>
				<MoneyInput name="priceMinor" label="Цена" placeholder="Введите цену" valueMinor={0} />
				<Button type="submit" class="self-start" disabled={variants.length === 0}
					>Сохранить цену</Button
				>
			</form>
		</Card.Content></Card.Root
	>
	<Card.Root
		><Card.Content>
			<h2 class="mb-4 text-2xl">Позиции прайс-листа</h2>
			{#if data.list.items.length === 0}<p class="text-fg-muted">Цен пока нет.</p>{/if}
			<ul class="divide-y divide-border">
				{#each data.list.items as item (item.variantId)}
					<li class="flex flex-wrap items-center gap-3 py-3">
						<span class="flex-1"
							>{data.variants.find((row) => row.id === item.variantId)?.sku ?? `#${item.variantId}`} ·
							{formatMinor(item.priceMinor)} ₽</span
						>
						<form
							method="POST"
							action="?/delete"
							use:enhance={withToast({ success: 'Цена удалена' })}
						>
							<input type="hidden" name="id" value={item.variantId} /><Button
								type="submit"
								variant="danger"
								size="sm">Удалить</Button
							>
						</form>
					</li>
				{/each}
			</ul>
		</Card.Content></Card.Root
	>
</div>
