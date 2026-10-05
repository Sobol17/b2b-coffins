<script lang="ts">
	import { roubles } from './labels';

	/* The three figures of a day: who shares, what the day made, what each one gets. */
	let {
		presentCount,
		totalMinor,
		shareMinor
	}: { presentCount: number; totalMinor: number; shareMinor: number } = $props();
</script>

<dl class="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-3" data-testid="day-summary">
	<div>
		<dt class="text-sm text-fg-muted">Работало</dt>
		<dd class="text-2xl tabular-nums" data-testid="day-present">{presentCount}</dd>
	</div>
	<div>
		<dt class="text-sm text-fg-muted">Сумма дня</dt>
		<dd class="text-2xl tabular-nums" data-testid="day-total">{roubles(totalMinor)}</dd>
	</div>
	<div>
		<dt class="text-sm text-fg-muted">Каждому</dt>
		<dd class="text-2xl tabular-nums" data-testid="day-share">{roubles(shareMinor)}</dd>
	</div>
</dl>
