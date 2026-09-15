<script lang="ts" module>
	/*
	 * The details form. Its id lets the summary aside submit it with the "Оформить заявку" button,
	 * so delivery, comment and the send travel in one request.
	 */
	export const DRAFT_FORM_ID = 'draft-details';
</script>

<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Input, RadioGroup, Textarea, type SelectOption } from '$lib/ui';
	import type { DraftDto } from '$lib/types/request';

	let { draft, formError }: { draft: DraftDto; formError?: string | undefined } = $props();

	let picked = $state<string | null>(null);

	const options = $derived<SelectOption[]>([
		...draft.addresses.map((address) => ({
			value: `address:${address.id}`,
			label: `${address.title}: ${address.address}`
		})),
		{ value: 'pickup', label: 'Самовывоз со склада мастерской' }
	]);
	const delivery = $derived(
		picked ??
			(draft.isPickup
				? 'pickup'
				: draft.deliveryAddressId !== null
					? `address:${draft.deliveryAddressId}`
					: '')
	);
</script>

<form
	id={DRAFT_FORM_ID}
	method="POST"
	action="?/submit"
	use:enhance
	class="flex flex-col gap-5 rounded-card bg-surface-raised p-6 sm:p-8"
>
	<h2 class="text-2xl">Отгрузка</h2>

	<RadioGroup
		name="delivery"
		label="Куда доставить"
		{options}
		bind:value={() => delivery, (next) => (picked = next)}
	/>

	<div class="grid gap-5 md:grid-cols-2">
		<Textarea
			name="comment"
			label="Комментарий к заявке"
			placeholder="Например: разгрузка после 14:00"
			value={draft.comment ?? ''}
			rows={3}
			maxlength={1000}
		/>
		<Input
			name="externalNumber"
			label="Ваш номер заявки"
			hint="Номер из вашей учётной системы, если он есть"
			value={draft.externalNumber ?? ''}
			maxlength={40}
		/>
	</div>

	{#if formError}
		<p data-testid="draft-error" class="text-sm text-danger">{formError}</p>
	{/if}

	<Button type="submit" variant="secondary" formaction="?/details" class="self-start">
		Сохранить черновик
	</Button>
</form>
