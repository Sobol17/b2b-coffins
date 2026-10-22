<script lang="ts">
	import type { PublicContacts } from '$lib/types/landing';

	/** Requisites of the operator in a document: only what the workshop has filled in settings. */
	let { contacts, site }: { contacts: PublicContacts; site: string } = $props();

	const rows = $derived(
		[
			['Оператор', contacts.operator?.name],
			['ИНН', contacts.operator?.inn],
			[contacts.operator?.ogrn?.length === 15 ? 'ОГРНИП' : 'ОГРН', contacts.operator?.ogrn],
			['Адрес', contacts.address],
			['Телефон', contacts.phone],
			['Электронная почта', contacts.operator?.email],
			['Сайт', site]
		].filter((row): row is [string, string] => typeof row[1] === 'string' && row[1] !== '')
	);
</script>

<dl
	data-testid="operator-details"
	class="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-[12rem_1fr]"
>
	{#each rows as [term, value] (term)}
		<dt class="text-fg-muted">{term}</dt>
		<dd>{value}</dd>
	{/each}
</dl>
