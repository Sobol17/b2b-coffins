<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import DayForm from '$lib/crm/payroll/DayForm.svelte';
	import DaySummary from '$lib/crm/payroll/DaySummary.svelte';
	import {
		PERIOD_STATUS_TITLE,
		PERIOD_STATUS_TONE,
		dayTitle,
		roubles,
		weekdayTitle
	} from '$lib/crm/payroll/labels';
	import { addDays } from '$lib/domain/payroll/calc';
	import { Breadcrumbs, Button, Card, TONE_CLASS, buttonVariants, withToast } from '$lib/ui';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const day = $derived(data.day);
	const title = $derived(`${dayTitle(day.date)}, ${weekdayTitle(day.date)}`);
	const present = $derived(day.staff.filter((row) => row.present));
	const dayHref = (date: string) => resolve(`/crm/payroll/day/${date}`);
</script>

<svelte:head><title>Рабочий день {dayTitle(day.date)}</title></svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
	<Breadcrumbs items={[{ label: 'Выплаты', href: resolve('/crm/payroll') }, { label: title }]} />
	<div class="flex flex-wrap items-center gap-3">
		<h1 class="text-3xl" data-testid="day-title">{title}</h1>
		<span
			class={['rounded-pill px-2 py-0.5 text-xs', TONE_CLASS[PERIOD_STATUS_TONE[day.periodStatus]]]}
			data-testid="day-period-status"
		>
			Неделя: {PERIOD_STATUS_TITLE[day.periodStatus].toLowerCase()}
		</span>
		<div class="flex flex-wrap gap-2 sm:ml-auto">
			<a class={buttonVariants({ variant: 'secondary' })} href={dayHref(addDays(day.date, -1))}>
				Предыдущий день
			</a>
			<a class={buttonVariants({ variant: 'secondary' })} href={dayHref(addDays(day.date, 1))}>
				Следующий день
			</a>
		</div>
	</div>

	{#if day.canCopyPrevious}
		<form method="POST" action="?/copy" use:enhance={withToast({ success: 'Состав скопирован' })}>
			<Button type="submit" variant="secondary">Скопировать состав прошлого дня</Button>
		</form>
	{/if}

	<Card.Root>
		<Card.Content>
			{#if day.canEdit}
				<!-- A reloaded day re-creates the form, so its fields start from the saved figures. -->
				{#key day}
					<DayForm {day} />
				{/key}
			{:else}
				<div class="flex flex-col gap-6">
					{#if day.periodStatus !== 'open'}
						<p class="text-fg-muted">
							Неделя закрыта. Чтобы изменить день, откройте неделю в сводной ведомости.
						</p>
					{/if}
					<section>
						<h2 class="mb-2 text-2xl">Кто работал</h2>
						{#if present.length === 0}
							<p class="text-fg-muted">Никто не отмечен.</p>
						{:else}
							<ul class="list-inside list-disc">
								{#each present as worker (worker.id)}<li>{worker.fullName}</li>{/each}
							</ul>
						{/if}
					</section>
					<section>
						<h2 class="mb-2 text-2xl">Что сделали</h2>
						{#if day.entries.length === 0}
							<p class="text-fg-muted">Работы не внесены.</p>
						{:else}
							<ul class="flex flex-col gap-1">
								{#each day.entries as entry (entry.workTypeId)}
									<li class="tabular-nums">
										{entry.title}: {entry.qty} × {roubles(entry.rateMinor)} = {roubles(
											entry.amountMinor
										)}
									</li>
								{/each}
							</ul>
						{/if}
					</section>
					<DaySummary
						presentCount={day.presentCount}
						totalMinor={day.totalMinor}
						shareMinor={day.shareMinor}
					/>
				</div>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
