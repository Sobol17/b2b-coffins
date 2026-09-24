<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import LinesEditor from '$lib/crm/requests/LinesEditor.svelte';
	import { PRIORITY_OPTIONS } from '$lib/crm/requests/labels';
	import {
		Breadcrumbs,
		Button,
		Card,
		DatePicker,
		Input,
		RadioGroup,
		Select,
		Textarea,
		withToast
	} from '$lib/ui';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let kind = $state('counterparty');
	// Follows the page after a reload with another counterparty, and the manager's pick in between.
	let counterpartyId = $derived(data.counterpartyId === null ? '' : String(data.counterpartyId));
	// The default address of the freshly loaded counterparty is the usual answer; the manager may
	// pick another one, and the next counterparty resets the choice.
	let addressId = $derived.by(() => {
		const preferred = data.addresses.find((row) => row.isDefault) ?? data.addresses[0];
		return preferred ? String(preferred.id) : '';
	});
	let priority = $state('normal');
	let pending = $state(false);

	const counterpartyOptions = $derived(
		data.choices.counterparties.map((row) => ({ value: String(row.id), label: row.name }))
	);
	const addressOptions = $derived(
		data.addresses.map((row) => ({ value: String(row.id), label: `${row.title}: ${row.address}` }))
	);

	function pickCounterparty(value: string): void {
		counterpartyId = value;
		const url = new URL(page.url);
		url.searchParams.set('counterpartyId', value);
		// Same page with a rewritten query string: the load answers with the addresses of that one.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(url, { replaceState: true, keepFocus: true, noScroll: true });
	}
</script>

<svelte:head><title>Новая заявка</title></svelte:head>

<div class="mx-auto flex w-full max-w-4xl flex-col gap-6">
	<Breadcrumbs items={[{ label: 'Заявки', href: resolve('/crm/requests') }, { label: 'Новая' }]} />
	<h1 class="text-3xl">Новая заявка</h1>

	<form
		method="POST"
		class="flex flex-col gap-6"
		use:enhance={withToast({ reset: false, pending: (value) => (pending = value) })}
	>
		<Card.Root>
			<Card.Header><Card.Title>Для кого</Card.Title></Card.Header>
			<Card.Content class="flex flex-col gap-4">
				<RadioGroup
					name="kind"
					bind:value={kind}
					options={[
						{ value: 'counterparty', label: 'Заявка контрагента' },
						{ value: 'stock', label: 'На склад' }
					]}
				/>
				{#if kind === 'counterparty'}
					<Select
						label="Контрагент"
						options={counterpartyOptions}
						placeholder="Выберите контрагента"
						bind:value={() => counterpartyId, pickCounterparty}
						required
					/>
					<input type="hidden" name="counterpartyId" value={counterpartyId} />
					<Select
						label="Адрес доставки"
						options={addressOptions}
						placeholder={counterpartyId === '' ? 'Сначала выберите контрагента' : 'Выберите адрес'}
						bind:value={addressId}
						disabled={addressOptions.length === 0}
						required
					/>
					<input type="hidden" name="deliveryAddressId" value={addressId} />
					<div class="grid gap-4 sm:grid-cols-2">
						<DatePicker name="deliveryDate" label="Дата доставки" required />
						<Input
							name="deliveryTime"
							type="time"
							label="Время доставки"
							placeholder="Укажите время"
							required
						/>
					</div>
					<Input
						name="deceasedName"
						label="ФИО умершего"
						placeholder="Введите ФИО"
						maxlength={200}
						required
					/>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header><Card.Title>Состав</Card.Title></Card.Header>
			<Card.Content>
				<LinesEditor variants={data.choices.variants} />
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header><Card.Title>Условия</Card.Title></Card.Header>
			<Card.Content class="flex flex-col gap-4">
				<Select
					label="Приоритет"
					options={PRIORITY_OPTIONS}
					placeholder="Выберите приоритет"
					bind:value={priority}
				/>
				<input type="hidden" name="priority" value={priority} />
				<Textarea
					name="comment"
					label="Комментарий"
					placeholder="Введите комментарий"
					maxlength={1000}
				/>
			</Card.Content>
		</Card.Root>

		<Button type="submit" size="lg" class="self-start" loading={pending}>Завести заявку</Button>
	</form>
</div>
