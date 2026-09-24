<script lang="ts">
	import { Input } from '$lib/ui';
	import { PLACEHOLDER } from '$lib/utils/placeholders';

	/** Requisite fields shared by the new-counterparty form and the card; the form owns the submit. */
	let {
		values
	}: {
		values?: {
			name: string;
			legalName: string | null;
			inn: string | null;
			kpp: string | null;
			address: string | null;
			phone: string | null;
			email: string | null;
		};
	} = $props();
</script>

<div class="md:col-span-2">
	<Input
		name="name"
		label="Название"
		placeholder="Введите название"
		value={values?.name ?? ''}
		required
	/>
</div>
<div class="md:col-span-2">
	<Input
		name="legalName"
		label="Юридическое название"
		placeholder="Введите юридическое название"
		value={values?.legalName ?? ''}
	/>
</div>
<Input name="inn" label="ИНН" placeholder="Введите ИНН" value={values?.inn ?? ''} />
<Input name="kpp" label="КПП" placeholder="Введите КПП" value={values?.kpp ?? ''} />
<div class="md:col-span-2">
	<Input
		name="address"
		label="Юридический адрес"
		placeholder="Введите адрес"
		value={values?.address ?? ''}
	/>
</div>
<Input
	name="phone"
	type="tel"
	label="Телефон"
	placeholder={PLACEHOLDER.phone}
	value={values?.phone ?? ''}
/>
<Input
	name="email"
	type="email"
	label="Электронная почта"
	placeholder={PLACEHOLDER.email}
	value={values?.email ?? ''}
/>
