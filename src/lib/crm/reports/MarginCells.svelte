<script lang="ts">
	import { roubles } from '$lib/crm/payroll/labels';
	import type { MarginTotalsDto } from '$lib/types/crm-reports';
	import { percentOfBp } from './labels';

	/* The money cells the counterparty row and the request row share (v1.63). */
	let { row, key }: { row: Omit<MarginTotalsDto, 'requestCount'>; key: string } = $props();
</script>

{#if key === 'qty'}
	<span class="tabular-nums">{row.qty}</span>
{:else if key === 'total'}
	<span class="tabular-nums">{roubles(row.totalMinor)}</span>
{:else if key === 'cost'}
	<span class="tabular-nums">{roubles(row.costMinor)}</span>
	{#if row.uncostedQty > 0}
		<span class="block text-xs text-warning">без себестоимости {row.uncostedQty} шт.</span>
	{/if}
{:else if key === 'margin'}
	<span class={['font-medium tabular-nums', row.marginMinor < 0 ? 'text-danger' : '']}>
		{roubles(row.marginMinor)}
	</span>
{:else if key === 'share'}
	<span class="tabular-nums">{percentOfBp(row.marginBp)}</span>
{:else if key === 'paid'}
	<span class="tabular-nums">{roubles(row.paidMinor)}</span>
{/if}
