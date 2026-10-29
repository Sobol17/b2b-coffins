<script lang="ts">
	import { stationTitle } from '$lib/crm/shop/labels';
	import type { CrmLineShopDto } from '$lib/types/crm-shop';

	let { shop }: { shop: CrmLineShopDto } = $props();
</script>

<ul class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-muted" data-testid="line-shop">
	{#if shop.fromStockQty > 0}
		<li>Со склада {shop.fromStockQty}</li>
	{/if}
	{#each shop.stations as job (job.station)}
		<li>{stationTitle(job.station)}: сделано {job.doneQty} из {job.qty}</li>
	{/each}
	{#if shop.madeQty > 0}
		<li>Сделано цехом {shop.madeQty}</li>
	{/if}
	{#if shop.heldBy.length > 0}
		<li class="text-warning">Склад отдан заявке {shop.heldBy.join(', ')}</li>
	{/if}
</ul>
