<script lang="ts">
	import { bucketCaption } from '$lib/crm/finance/labels';
	import { roubles } from '$lib/crm/payroll/labels';
	import type { SalesBucket } from '$lib/types/crm-reports';
	import type { FinanceBucketDto } from '$lib/types/finance';

	/*
	 * Income and expense side by side per bucket. Bars are plain blocks: tech.md 3 bans a chart
	 * library, and two series of at most 31 bars do not need one. The table under the bars carries
	 * the same numbers for screen readers.
	 */
	let { buckets, bucket }: { buckets: readonly FinanceBucketDto[]; bucket: SalesBucket } = $props();

	const peak = $derived(
		Math.max(
			1,
			...buckets.flatMap((b) => [Math.max(0, b.incomeMinor), Math.max(0, b.expenseMinor)])
		)
	);
	const height = (minor: number): string => `${(Math.max(0, minor) / peak) * 100}%`;
	const rows = $derived(
		buckets.map((b) => {
			const caption = bucketCaption(b, bucket);
			return {
				...b,
				caption,
				label: `${caption.full}: доходы ${roubles(b.incomeMinor)}, расходы ${roubles(b.expenseMinor)}`
			};
		})
	);
</script>

<div class="flex flex-col gap-3">
	<div class="flex flex-wrap gap-4 text-sm text-fg-muted" aria-hidden="true">
		<span class="flex items-center gap-2"
			><span class="size-3 rounded-sm bg-success"></span>Доходы</span
		>
		<span class="flex items-center gap-2"
			><span class="size-3 rounded-sm bg-danger"></span>Расходы</span
		>
	</div>
	<!-- The chart scrolls inside its card: the page itself never scrolls sideways. -->
	<div class="overflow-x-auto" aria-hidden="true">
		<div class="flex min-w-max items-end gap-1 border-b border-border pb-1">
			{#each rows as row (row.from)}
				<div class="flex w-8 flex-col items-center gap-1" title={row.label}>
					<div class="flex h-40 w-full items-end justify-center gap-0.5">
						<div class="w-3 rounded-t-sm bg-success" style:height={height(row.incomeMinor)}></div>
						<div class="w-3 rounded-t-sm bg-danger" style:height={height(row.expenseMinor)}></div>
					</div>
				</div>
			{/each}
		</div>
		<div class="flex min-w-max gap-1 pt-1">
			{#each rows as row (row.from)}
				<span class="w-8 text-center text-xs text-fg-muted tabular-nums">{row.caption.short}</span>
			{/each}
		</div>
	</div>
	<table class="sr-only">
		<caption>Доходы и расходы по периодам</caption>
		<thead><tr><th>Период</th><th>Доходы</th><th>Расходы</th></tr></thead>
		<tbody>
			{#each rows as row (row.from)}
				<tr>
					<td>{row.caption.full}</td>
					<td>{roubles(row.incomeMinor)}</td>
					<td>{roubles(row.expenseMinor)}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
