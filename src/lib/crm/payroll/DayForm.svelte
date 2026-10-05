<script lang="ts">
	import { enhance } from '$app/forms';
	import { dayShareMinor, dayTotalMinor } from '$lib/domain/payroll/calc';
	import { Button, Checkbox, NumberInput, withToast } from '$lib/ui';
	import { PAYROLL_QTY_MAX, type WorkDayDto } from '$lib/types/crm-payroll';
	import DaySummary from './DaySummary.svelte';
	import { roubles } from './labels';

	/*
	 * The whole day in one form: tick who worked, type how much of each work was done. The figures
	 * below are a preview from the same pure functions the server uses; the server counts again.
	 */
	let { day }: { day: WorkDayDto } = $props();

	// The page re-creates the form when the day reloads, so the props seed the state once.
	// svelte-ignore state_referenced_locally
	let people = $state(day.staff.map((row) => ({ ...row })));
	// A work already on the day keeps the price it was written with.
	// svelte-ignore state_referenced_locally
	let works = $state(
		day.workTypes.map((work) => {
			const entry = day.entries.find((row) => row.workTypeId === work.id);
			return {
				id: work.id,
				title: work.title,
				rateMinor: entry?.rateMinor ?? work.rateMinor,
				qty: entry?.qty ?? 0
			};
		})
	);
	let pending = $state(false);

	const presentCount = $derived(people.filter((row) => row.present).length);
	// A cleared field reads as NaN: it counts as zero until a number is typed.
	const totalMinor = $derived(
		dayTotalMinor(works.map((work) => ({ ...work, qty: Number(work.qty) || 0 })))
	);
</script>

<form
	method="POST"
	action="?/save"
	class="flex flex-col gap-6"
	use:enhance={withToast({
		reset: false,
		pending: (value) => (pending = value),
		success: 'День сохранён'
	})}
>
	<section class="flex flex-col gap-3">
		<h2 class="text-2xl">Кто работал</h2>
		{#if day.staff.length === 0}
			<p class="text-fg-muted">Сотрудников нет. Добавьте их в разделе «Сотрудники».</p>
		{/if}
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="day-staff">
			{#each people as worker (worker.id)}
				<Checkbox
					name={`staff.${worker.id}`}
					value="on"
					label={worker.position ? `${worker.fullName}, ${worker.position}` : worker.fullName}
					bind:checked={worker.present}
				/>
			{/each}
		</div>
	</section>

	<section class="flex flex-col gap-3">
		<h2 class="text-2xl">Что сделали</h2>
		{#if day.workTypes.length === 0}
			<p class="text-fg-muted">Работ нет. Добавьте их в разделе «Работы и стоимость».</p>
		{/if}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="day-works">
			{#each works as work (work.id)}
				<NumberInput
					name={`qty.${work.id}`}
					label={work.title}
					hint={`${roubles(work.rateMinor)} за единицу`}
					placeholder="Введите количество"
					min={0}
					max={PAYROLL_QTY_MAX}
					bind:value={work.qty}
				/>
			{/each}
		</div>
	</section>

	<DaySummary {presentCount} {totalMinor} shareMinor={dayShareMinor(totalMinor, presentCount)} />
	<Button type="submit" loading={pending} class="self-start">Сохранить день</Button>
</form>
