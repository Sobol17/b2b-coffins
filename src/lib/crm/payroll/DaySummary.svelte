<script lang="ts">
	import { roubles } from './labels';

	/* The figures of a day: who came, what the day made, and what each one earned from their works. */
	let {
		presentCount,
		totalMinor,
		shares
	}: {
		presentCount: number;
		totalMinor: number;
		shares: readonly { staffId: number; fullName: string; shareMinor: number }[];
	} = $props();
</script>

<div class="flex flex-col gap-4 rounded-lg border border-border p-4" data-testid="day-summary">
	<dl class="grid gap-4 sm:grid-cols-2">
		<div>
			<dt class="text-sm text-fg-muted">Работало</dt>
			<dd class="text-2xl tabular-nums" data-testid="day-present">{presentCount}</dd>
		</div>
		<div>
			<dt class="text-sm text-fg-muted">Сумма дня</dt>
			<dd class="text-2xl tabular-nums" data-testid="day-total">{roubles(totalMinor)}</dd>
		</div>
	</dl>
	{#if shares.length > 0}
		<div>
			<h3 class="mb-2 text-sm text-fg-muted">Начислено за день</h3>
			<ul class="flex flex-col gap-1" data-testid="day-shares">
				{#each shares as share (share.staffId)}
					<li class="flex justify-between gap-4 tabular-nums" data-testid="day-share">
						<span>{share.fullName}</span>
						<span>{roubles(share.shareMinor)}</span>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>
