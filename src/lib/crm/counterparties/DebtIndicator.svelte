<script lang="ts">
	import { TONE_CLASS } from '$lib/ui';
	import { formatMinor, pluralRu } from '$lib/utils/format';

	/*
	 * The debt comes from the payment marks (tech.md v1.39), so it agrees with the registry of marks
	 * on the same card. A role without prices receives no debt and the badge is not drawn.
	 */
	let { debt }: { debt: { debtMinor: number; openCount?: number } | undefined } = $props();

	const requests = (count: number) => `${count} ${pluralRu(count, ['заявка', 'заявки', 'заявок'])}`;
</script>

{#if debt}
	<span
		data-testid="debt-indicator"
		class={[
			'inline-flex rounded-pill px-3 py-1 text-sm whitespace-nowrap tabular-nums',
			TONE_CLASS[debt.debtMinor > 0 ? 'warning' : 'success']
		]}
	>
		{#if debt.debtMinor > 0}
			Долг {formatMinor(debt.debtMinor)} ₽{debt.openCount === undefined
				? ''
				: ` · ${requests(debt.openCount)}`}
		{:else}
			Долга нет
		{/if}
	</span>
{/if}
