<script lang="ts">
	import { Button } from '$lib/ui';
	import ProductPhoto from './ProductPhoto.svelte';

	let { mediaIds, title }: { mediaIds: readonly number[]; title: string } = $props();

	let selected = $state(0);
	const current = $derived(mediaIds[selected] ?? mediaIds[0] ?? null);
</script>

<div data-testid="product-gallery" class="rounded-card bg-surface-raised p-4 sm:p-5">
	<div class={['grid gap-3', mediaIds.length > 1 && 'sm:grid-cols-[4.5rem_1fr]']}>
		{#if mediaIds.length > 1}
			<div class="flex gap-2 sm:flex-col">
				{#each mediaIds as mediaId, index (mediaId)}
					<Button
						variant="ghost"
						class={[
							'h-auto w-16 overflow-hidden rounded-inset p-0 sm:w-full',
							index === selected && 'ring-2 ring-brand'
						]}
						aria-label="Фото {index + 1}"
						aria-pressed={index === selected}
						onclick={() => (selected = index)}
					>
						<ProductPhoto {mediaId} alt="" class="aspect-square" />
					</Button>
				{/each}
			</div>
		{/if}
		<ProductPhoto
			mediaId={current}
			alt={title}
			caption="основное фото изделия"
			class="aspect-[4/3] max-h-80 sm:max-h-96"
		/>
	</div>
</div>
