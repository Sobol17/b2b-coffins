<script lang="ts" module>
	/*
	 * The details form. Its id lets the summary aside submit it with the "Оформить заявку" button,
	 * so delivery, comment and the send travel in one request.
	 */
	export const DRAFT_FORM_ID = 'draft-details';
</script>

<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import {
		Button,
		DatePicker,
		Input,
		Select,
		Textarea,
		withToast,
		type SelectOption,
		type ToastSpec
	} from '$lib/ui';
	import type { DraftDto, SubmittedRequestDto } from '$lib/types/request';

	let { draft, formError }: { draft: DraftDto; formError?: string | undefined } = $props();

	/*
	 * A draft may hold half of the form: the send is what the server blocks, not the saving.
	 * Only the two controls that own their value need state; the plain inputs submit their own.
	 */
	let pickedAddress = $state<string | null>(null);
	let pickedDate = $state<string | null>(null);

	const address = $derived(
		pickedAddress ?? (draft.deliveryAddressId === null ? '' : String(draft.deliveryAddressId))
	);
	const date = $derived(pickedDate ?? draft.deliveryAt?.slice(0, 10) ?? '');

	const options = $derived<SelectOption[]>(
		draft.addresses.map((item) => ({
			value: String(item.id),
			label: `${item.title}: ${item.address}`
		}))
	);
	function isSubmitted(value: unknown): value is SubmittedRequestDto {
		return typeof value === 'object' && value !== null && 'number' in value && 'id' in value;
	}

	// One form, two buttons: the answer tells a sent request from a saved draft.
	function confirmation(data: Record<string, unknown> | undefined): ToastSpec | null {
		const sent = data?.['submitted'];
		if (!isSubmitted(sent)) return data?.['saved'] ? { title: 'Черновик сохранён' } : null;
		return {
			title: `Заявка ${sent.number} отправлена`,
			description: 'Администратор мастерской примет её в работу и подтвердит цены',
			action: {
				label: 'Открыть заявку',
				href: resolve(`/portal/requests/${sent.id}`)
			}
		};
	}
</script>

<form
	id={DRAFT_FORM_ID}
	method="POST"
	action="?/submit"
	use:enhance={withToast({ success: confirmation, reset: false })}
	class="flex flex-col gap-5 rounded-card bg-surface-raised p-6 sm:p-8"
>
	<h2 class="text-2xl">Отгрузка</h2>

	<!-- The kit draws the trigger as a button, which no <label for> can point at: hence the hooks. -->
	<div data-testid="delivery-address">
		<Select
			name="deliveryAddressId"
			label="Адрес доставки"
			placeholder="Выберите адрес"
			{options}
			bind:value={() => address, (next) => (pickedAddress = next)}
			required
		/>
	</div>

	<div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
		<div data-testid="delivery-date">
			<DatePicker
				name="deliveryDate"
				label="Дата доставки"
				bind:value={() => date, (next) => (pickedDate = next)}
				required
			/>
		</div>
		<Input
			name="deliveryTime"
			type="time"
			label="Время доставки"
			placeholder="Введите время"
			value={draft.deliveryAt?.slice(11, 16) ?? ''}
			required
		/>
	</div>

	<Input
		name="deceasedName"
		label="ФИО умершего"
		placeholder="Введите ФИО"
		value={draft.deceasedName ?? ''}
		maxlength={200}
		required
	/>

	<Textarea
		name="comment"
		label="Комментарий к заявке"
		placeholder="Введите комментарий"
		value={draft.comment ?? ''}
		rows={3}
		maxlength={1000}
	/>

	{#if formError}
		<p data-testid="draft-error" class="text-sm text-danger">{formError}</p>
	{/if}

	<Button type="submit" variant="secondary" formaction="?/details" class="self-start">
		Сохранить черновик
	</Button>
</form>
