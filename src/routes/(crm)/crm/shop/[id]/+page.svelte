<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import JobRow from '$lib/crm/shop/JobRow.svelte';
	import { stationTitle } from '$lib/crm/shop/labels';
	import { PRIORITY_TITLE } from '$lib/crm/requests/labels';
	import { Card, TONE_CLASS, TouchButton, withToast } from '$lib/ui';
	import { formatDateTime } from '$lib/utils/format';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const task = $derived(data.task);
	const open = $derived(task.completedAt === null);
</script>

<svelte:head><title>{task.number} · {stationTitle(task.station)}</title></svelte:head>

<div class="mx-auto flex w-full max-w-3xl flex-col gap-6">
	<a href={resolve('/crm/shop')} class="text-link hover:text-link-hover">← Цех</a>

	<div class="flex flex-col gap-2">
		<div class="flex flex-wrap items-center gap-2">
			<h1 class="text-3xl" data-testid="shop-task-number">{task.number}</h1>
			{#if task.priority === 'urgent'}
				<span class={['rounded-pill px-3 py-0.5 text-xs', TONE_CLASS.warning]}>
					{PRIORITY_TITLE.urgent}
				</span>
			{/if}
			{#if task.isStockRequest}
				<span class="text-sm text-fg-muted">На склад</span>
			{/if}
		</div>
		<p class="text-fg-muted">
			{stationTitle(task.station)}
			{#if task.deliveryAt}
				· срок {formatDateTime(task.deliveryAt, data.timezone)}
			{/if}
		</p>
		{#if task.comment}
			<p class="text-sm">Комментарий: {task.comment}</p>
		{/if}
		{#if task.completedAt}
			<p class="text-sm" data-testid="shop-task-closed">
				Выполнено {formatDateTime(task.completedAt, data.timezone)}
			</p>
		{:else if task.takenAt}
			<p class="text-sm">В работе{task.takenByName ? `: ${task.takenByName}` : ''}</p>
		{/if}
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Позиции</Card.Title>
		</Card.Header>
		<Card.Content>
			<ul class="flex flex-col gap-3">
				{#each task.jobs as job (job.id)}
					<JobRow {job} {open} />
				{:else}
					<p class="text-sm text-fg-muted">Позиции переданы дальше.</p>
				{/each}
			</ul>
		</Card.Content>
	</Card.Root>

	{#if open}
		<div class="flex flex-wrap gap-3">
			{#if task.canTake}
				<form method="POST" action="?/take" use:enhance={withToast({ success: 'Заявка в работе' })}>
					<TouchButton type="submit" variant="secondary">Взять в работу</TouchButton>
				</form>
			{/if}
			<form
				method="POST"
				action="?/complete"
				use:enhance={withToast({ success: 'Передано на следующую станцию' })}
			>
				<TouchButton type="submit" variant="primary" disabled={!task.canComplete}>
					Выполнено
				</TouchButton>
			</form>
		</div>
	{/if}
</div>
