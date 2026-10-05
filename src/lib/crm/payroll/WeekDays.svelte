<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PayrollDayCellDto } from '$lib/types/crm-payroll';
	import { dayTitle, roubles, weekdayTitle } from './labels';

	/* Seven days of the week, each a link to its day sheet. A day ahead of today cannot be marked. */
	let { days, today }: { days: readonly PayrollDayCellDto[]; today: string } = $props();
</script>

<ul class="grid gap-3 sm:grid-cols-4 lg:grid-cols-7" data-testid="week-days">
	{#each days as day (day.date)}
		<li>
			<a
				href={resolve(`/crm/payroll/day/${day.date}`)}
				class={[
					'flex h-full flex-col gap-1 rounded-lg border border-border p-3 hover:bg-surface-muted',
					day.date > today && 'opacity-50'
				]}
				data-testid="week-day"
			>
				<span class="text-sm text-fg-muted">{weekdayTitle(day.date)}, {dayTitle(day.date)}</span>
				{#if day.presentCount === 0}
					<span class="text-fg-muted">{day.date > today ? 'Впереди' : 'Не отмечен'}</span>
				{:else}
					<span class="tabular-nums">Работало: {day.presentCount}</span>
					<span class="tabular-nums">Сумма: {roubles(day.totalMinor)}</span>
					<span class="tabular-nums">Каждому: {roubles(day.shareMinor)}</span>
				{/if}
			</a>
		</li>
	{/each}
</ul>
