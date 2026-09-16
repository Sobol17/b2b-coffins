<script lang="ts">
	import { PriceCell } from '$lib/ui';

	/*
	 * Two prices of one model (tech.md P7): the agency price the counterparty shows its client,
	 * and, for a role with prices, its own purchase price greyed out underneath. A role without
	 * either gets the dash of `PriceCell`.
	 */
	let {
		agencyMinor,
		purchaseMinor,
		prefix,
		suffix = '₽'
	}: {
		agencyMinor?: number | undefined;
		purchaseMinor?: number | undefined;
		prefix?: string | undefined;
		suffix?: string;
	} = $props();

	const leadMinor = $derived(agencyMinor ?? purchaseMinor);
	const showsBoth = $derived(agencyMinor !== undefined && purchaseMinor !== undefined);
</script>

<span data-testid="price-pair" class="inline-flex flex-col">
	<span>
		{#if leadMinor !== undefined && prefix}{prefix}{/if}
		<PriceCell valueMinor={leadMinor} />
		{#if leadMinor !== undefined}{suffix}{/if}
	</span>
	{#if showsBoth}
		<span data-testid="purchase-price" class="text-xs font-normal text-fg-faint">
			закупка <PriceCell valueMinor={purchaseMinor} />
			{suffix}
		</span>
	{/if}
</span>
