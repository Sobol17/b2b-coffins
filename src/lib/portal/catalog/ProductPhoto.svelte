<script lang="ts">
	import { asset } from '$app/paths';
	import type { ClassValue } from 'svelte/elements';

	/**
	 * A product photo through the rights-checked files route. A model without a photo gets the
	 * faded mark of the workshop instead of a caption, so the card does not read as unfinished.
	 */
	let {
		mediaId,
		alt,
		class: className
	}: {
		mediaId: number | null;
		alt: string;
		class?: ClassValue | undefined;
	} = $props();
</script>

{#if mediaId !== null}
	<img
		src="/api/files/{mediaId}"
		{alt}
		loading="lazy"
		class={['w-full rounded-inset bg-surface-muted object-cover', className]}
	/>
{:else}
	<div
		data-testid="product-photo-empty"
		aria-hidden="true"
		class={['flex w-full items-center justify-center rounded-inset bg-surface-muted', className]}
	>
		<img
			src={asset('/brand/mark.png')}
			alt=""
			width="144"
			height="144"
			class="size-16 rounded-inset opacity-25 grayscale sm:size-20"
		/>
	</div>
{/if}
