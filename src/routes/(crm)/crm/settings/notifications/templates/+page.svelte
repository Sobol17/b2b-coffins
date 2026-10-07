<script lang="ts">
	import TemplateForm from '$lib/crm/notifications/TemplateForm.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Шаблоны уведомлений</title></svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
	<div>
		<h1 class="mb-2 text-3xl">Шаблоны уведомлений</h1>
		<p class="max-w-3xl text-fg-muted">
			Текст пуша по каждому событию. В уведомлении нет цен и личных данных: его видно на
			заблокированном экране.
		</p>
	</div>
	{#each data.templates as template (template.eventKey)}
		<TemplateForm {template} />
	{/each}
</div>
