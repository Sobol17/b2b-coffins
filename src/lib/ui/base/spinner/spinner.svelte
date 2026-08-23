<script lang="ts">
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import { cn } from '$lib/utils/cn.js';

	/*
	 * The generated component spread the whole SVGAttributes surface into the icon. Under
	 * exactOptionalPropertyTypes that intersection is a union TypeScript refuses to represent,
	 * so the prop surface is narrowed to what the kit actually passes.
	 */
	let { class: className, label = 'Загрузка' }: { class?: string; label?: string } = $props();
</script>

<Loader2Icon role="status" aria-label={label} class={cn('size-4 animate-spin', className)} />
