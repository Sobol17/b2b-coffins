<script lang="ts">
	import FileUpload from './FileUpload.svelte';
	import PhotoGallery from './PhotoGallery.svelte';

	let {
		mediaIds = $bindable([]),
		editable = true,
		maxSizeMb = 10
	}: {
		mediaIds?: number[];
		editable?: boolean;
		maxSizeMb?: number;
	} = $props();
</script>

<div data-slot="photo-uploader" class="flex flex-col gap-3">
	<PhotoGallery
		{mediaIds}
		{editable}
		onRemove={(mediaId) => (mediaIds = mediaIds.filter((id) => id !== mediaId))}
	/>
	{#if editable}
		<FileUpload
			accept="image/*"
			{maxSizeMb}
			multiple
			onUploaded={(mediaId) => (mediaIds = [...mediaIds, mediaId])}
		/>
	{/if}
</div>
