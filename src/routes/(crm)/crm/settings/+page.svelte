<script lang="ts">
	import CharityForm from '$lib/crm/settings/CharityForm.svelte';
	import GeneralForm from '$lib/crm/settings/GeneralForm.svelte';
	import NumberingForm from '$lib/crm/settings/NumberingForm.svelte';
	import RequisitesForm from '$lib/crm/settings/RequisitesForm.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const settings = $derived(data.settings);
</script>

<svelte:head><title>Настройки</title></svelte:head>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
	<h1 class="text-3xl">Настройки мастерской</h1>
	<RequisitesForm requisites={settings.requisites} result={form} />
	<NumberingForm numbering={settings.numbering} result={form} />
	<CharityForm rateBp={settings.charityRateBp} fund={settings.charityFund} result={form} />
	<GeneralForm
		timezone={settings.timezone}
		staffLimitDefault={settings.staffLimitDefault}
		result={form}
	/>
</div>
