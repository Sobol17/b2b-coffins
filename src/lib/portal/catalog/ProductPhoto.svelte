<script lang="ts">
	import type { ClassValue } from 'svelte/elements';

	/** A product photo through the rights-checked files route, or the placeholder plate of the mockups. */
	let {
		mediaId,
		alt,
		caption = 'фото изделия',
		class: className
	}: {
		mediaId: number | null;
		alt: string;
		caption?: string;
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
		aria-hidden="true"
		class={[
			'flex w-full items-end justify-center rounded-inset bg-surface-muted p-3 text-[0.625rem] tracking-[0.08em] text-fg-faint uppercase',
			className
		]}
	>
		{caption}
	</div>
{/if}
