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

{#if shop.units && shop.units.length > 0}
	<details data-testid="line-shop-history" class="mt-3 rounded-inset bg-surface-muted px-3 text-sm">
		<summary
			class="cursor-pointer rounded-sm py-3 font-medium text-link focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
			>Кто работал над изделиями</summary
		>
		<ol class="space-y-4 pb-3">
			{#each shop.units as unit (unit.id)}
				<li data-testid="shop-unit-history" data-unit-id={unit.id}>
					<p class="mb-2 font-medium">Ящик №{unit.id}</p>
					<ul class="space-y-2">
						{#each unit.works as work (work.station)}
							<li
								data-testid="shop-unit-history-work"
								class="flex flex-wrap justify-between gap-x-4 gap-y-1 text-fg-muted"
							>
								<span>{stationTitle(work.station)} · {work.fullName}</span>
								<span>{work.completedAt === null ? 'В работе' : 'Выполнено'}</span>
							</li>
						{/each}
					</ul>
				</li>
			{/each}
		</ol>
	</details>
{/if}
