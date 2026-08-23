<script lang="ts">
	import { Spinner } from '$lib/ui/base/spinner/index.js';

	/* Placeholder inside a popover while its panel loads, and the message when the load failed. */
	let { failed = false }: { failed?: boolean } = $props();
</script>

{#if failed}
	<p class="p-4 text-xs text-danger">Панель не загрузилась. Обновите страницу.</p>
{:else}
	<div class="flex items-center justify-center p-6"><Spinner /></div>
{/if}
