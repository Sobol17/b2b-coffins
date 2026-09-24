<script lang="ts">
	import { resolve } from '$app/paths';
	import DeliveryPanel, { DRAFT_FORM_ID } from '$lib/portal/cart/DeliveryPanel.svelte';
	import DraftLines from '$lib/portal/cart/DraftLines.svelte';
	import DraftSummary from '$lib/portal/cart/DraftSummary.svelte';
	import { Breadcrumbs, Button, Card, EmptyState } from '$lib/ui';
	import { formatDateTime } from '$lib/utils/format';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const submitted = $derived(form && 'submitted' in form ? form.submitted : undefined);
	const formError = $derived(form && 'formError' in form ? form.formError : undefined);
	const draft = $derived(data.draft);
</script>

<svelte:head><title>Заявка</title></svelte:head>

<div class="flex flex-col gap-4">
	<div class="px-2">
		<Breadcrumbs items={[{ label: 'Главная', href: resolve('/portal') }, { label: 'Заявка' }]} />
	</div>

	{#if data.repeated}
		<p data-testid="repeat-notice" class="px-2 text-fg-muted">
			Скопировано позиций: {data.repeated.copied}{data.repeated.skipped > 0
				? `, больше недоступны: ${data.repeated.skipped}`
				: ''}.
		</p>
	{/if}

	{#if submitted}
		<Card.Root>
			<Card.Content data-testid="request-submitted" class="flex flex-col gap-3">
				<h1 class="text-4xl">Заявка {submitted.number} отправлена</h1>
				<p class="text-fg-muted">
					Администратор мастерской получил заявку и примет её в работу. Цены и сроки он подтвердит
					при приёме.
				</p>
				<div class="flex flex-wrap gap-2">
					<Button href={resolve('/portal/catalog')}>Собрать новую заявку</Button>
					<Button variant="secondary" href={resolve('/portal')}>На главную</Button>
				</div>
			</Card.Content>
		</Card.Root>
	{:else if !draft || draft.items.length === 0}
		<h1 class="px-2 text-4xl sm:text-5xl">Заявка</h1>
		<EmptyState
			title="В заявке пока пусто"
			description="Добавьте модели из каталога, и они появятся здесь."
		>
			{#snippet action()}
				<Button href={resolve('/portal/catalog')}>Открыть каталог</Button>
			{/snippet}
		</EmptyState>
	{:else}
		<div class="flex flex-wrap items-end gap-x-5 gap-y-1 px-2">
			<h1 class="text-4xl sm:text-5xl">Заявка {draft.number}</h1>
			<span class="pb-1.5 text-fg-muted">
				Позиций: {draft.items.length} · изделий: {draft.unitCount} · черновик сохранён
				{formatDateTime(draft.updatedAt, data.timezone)}
			</span>
		</div>

		<div class="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_25rem]">
			<div class="flex flex-col gap-6">
				<DraftLines {draft} />
				<DeliveryPanel {draft} {formError} />
			</div>
			<DraftSummary {draft} formId={DRAFT_FORM_ID} />
		</div>
	{/if}
</div>
