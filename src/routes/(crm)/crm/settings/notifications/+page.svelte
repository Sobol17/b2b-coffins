<script lang="ts">
	import RuleMatrix from '$lib/crm/notifications/RuleMatrix.svelte';
	import { Card } from '$lib/ui';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Матрица уведомлений</title></svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
	<div>
		<h1 class="mb-2 text-3xl">Матрица уведомлений</h1>
		<p class="max-w-3xl text-fg-muted">
			Кто о каком событии узнаёт. Событие всегда попадает в колокольчик адресата. Пуш приходит на
			устройства, где человек включил уведомления. Бот в МАКС заработает позже. Писем о событиях
			система не шлёт.
		</p>
	</div>
	<Card.Root data-testid="notification-matrix">
		<Card.Content>
			<RuleMatrix cells={data.cells} />
		</Card.Content>
	</Card.Root>
</div>
