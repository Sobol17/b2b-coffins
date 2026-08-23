<script lang="ts">
	import Button from '$lib/ui/base/button/button.svelte';
	import EmptyState from './EmptyState.svelte';

	// Files are served through the api route that checks rights, never from a public folder.
	let {
		mediaIds,
		editable = false,
		onRemove
	}: {
		mediaIds: readonly number[];
		editable?: boolean;
		onRemove?: ((mediaId: number) => void) | undefined;
	} = $props();
</script>

<div data-slot="photo-gallery">
	{#if mediaIds.length === 0}
		<EmptyState title="Фотографий нет" />
	{:else}
		<ul class="flex flex-wrap gap-3">
			{#each mediaIds as mediaId (mediaId)}
				<li class="relative">
					<img
						src="/api/files/{mediaId}"
						alt="Фотография {mediaId}"
						loading="lazy"
						class="size-24 rounded-card border border-border object-cover"
					/>
					{#if editable && onRemove}
						<Button
							variant="danger"
							size="sm"
							class="absolute top-1 right-1 w-8 px-0"
							aria-label="Удалить фотографию"
							onclick={() => onRemove(mediaId)}
						>
							×
						</Button>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
