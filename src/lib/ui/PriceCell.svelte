<script lang="ts">
	import { formatMinor } from '$lib/utils/format';

	/*
	 * A role without prices never receives the field, so the prop is optional by type and the cell
	 * draws a dash. Hiding a price in markup instead is grounds for a rollback (tech.md 15.6).
	 */
	let { valueMinor, class: className }: { valueMinor?: number; class?: string } = $props();
</script>

<span data-slot="price-cell" class={['tabular-nums', className]}>{formatMinor(valueMinor)}</span>
