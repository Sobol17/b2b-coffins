<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Checkbox, NumberInput, Select, withToast } from '$lib/ui';
	import { PAYROLL_QTY_MAX, type WorkDayDto } from '$lib/types/crm-payroll';
	import DaySummary from './DaySummary.svelte';
	import { draftsOf, previewOf, rateOf, setCrewMember } from './day-draft';
	import { roubles } from './labels';

	/*
	 * The whole day in one form: tick who came, then add each work with its quantity and the
	 * people who did it (tech.md v1.55). A work is split among its crew only.
	 */
	let { day }: { day: WorkDayDto } = $props();

	// The page re-creates the form when the day reloads, so the props seed the state once.
	// svelte-ignore state_referenced_locally
	let people = $state(day.staff.map((row) => ({ ...row })));
	// svelte-ignore state_referenced_locally
	let drafts = $state(draftsOf(day));
	// svelte-ignore state_referenced_locally
	let nextKey = day.entries.length;
	let pending = $state(false);

	const works = $derived(
		day.workTypes.map((work) => ({
			value: String(work.id),
			label: `${work.title}, ${roubles(work.rateMinor)}`
		}))
	);
	const present = $derived(people.filter((row) => row.present));
	const preview = $derived(
		previewOf(
			day,
			present.map((row) => row.id),
			drafts
		)
	);
	const named = $derived(
		preview.shares.map((share) => ({
			...share,
			fullName: people.find((row) => row.id === share.staffId)?.fullName ?? ''
		}))
	);

	function addEntry(): void {
		drafts.push({ key: nextKey++, workTypeId: '', qty: 1, crew: [] });
	}
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
		<div class="flex flex-col gap-3" data-testid="day-works">
			{#each drafts as draft, index (draft.key)}
				{@const rateMinor = rateOf(day, draft.workTypeId)}
				<fieldset
					class="flex flex-col gap-3 rounded-lg border border-border p-4"
					data-testid="day-entry"
				>
					<div class="grid gap-3 sm:grid-cols-[2fr_1fr]">
						<Select
							name={`entry.${draft.key}.work`}
							label="Работа"
							placeholder="Выберите работу"
							options={works}
							hint={rateMinor === null ? undefined : `${roubles(rateMinor)} за единицу`}
							bind:value={draft.workTypeId}
						/>
						<NumberInput
							name={`entry.${draft.key}.qty`}
							label="Количество"
							placeholder="Введите количество"
							min={0}
							max={PAYROLL_QTY_MAX}
							bind:value={draft.qty}
						/>
					</div>
					<div class="flex flex-col gap-2">
						<span class="text-sm text-fg-muted">Кто сделал</span>
						{#if present.length === 0}
							<p class="text-fg-muted">Сначала отметьте, кто работал.</p>
						{/if}
						<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{#each present as worker (worker.id)}
								<Checkbox
									name={`entry.${draft.key}.staff.${worker.id}`}
									value="on"
									label={worker.fullName}
									bind:checked={
										() => draft.crew.includes(worker.id),
										(ticked) => setCrewMember(draft, worker.id, ticked)
									}
								/>
							{/each}
						</div>
					</div>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						class="self-start"
						onclick={() => drafts.splice(index, 1)}
					>
						Убрать работу
					</Button>
				</fieldset>
			{/each}
		</div>
		{#if day.workTypes.length > 0}
			<Button type="button" variant="secondary" class="self-start" onclick={addEntry}>
				Добавить работу
			</Button>
		{/if}
	</section>

	<DaySummary presentCount={present.length} totalMinor={preview.totalMinor} shares={named} />
	<Button type="submit" loading={pending} class="self-start">Сохранить день</Button>
</form>
