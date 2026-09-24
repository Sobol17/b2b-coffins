<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { Button, Card, FileUpload, PhotoGallery, withToast } from '$lib/ui';
	import type { CrmProductDto } from '$lib/types/crm-catalog';

	let { product }: { product: CrmProductDto } = $props();
	const ids = $derived(product.media.map((row) => row.id));
	function moved(index: number, shift: number): number[] {
		const next = [...ids];
		[next[index], next[index + shift]] = [next[index + shift] ?? 0, next[index] ?? 0];
		return next;
	}
</script>

<Card.Root
	><Card.Content class="flex flex-col gap-4">
		<h2 class="text-2xl">Фотографии</h2>
		<p class="text-sm text-fg-muted">Первая фотография становится обложкой в портале.</p>
		<PhotoGallery mediaIds={ids} />
		{#if !product.isDeleted}
			<FileUpload
				accept="image/jpeg,image/png,image/webp"
				maxSizeMb={10}
				fields={{ productId: String(product.id) }}
				label="Добавить фото"
				onUploaded={() => void invalidateAll()}
			/>
			<ul class="flex flex-col gap-2">
				{#each product.media as photo, index (photo.id)}
					<li class="flex flex-wrap items-center gap-2 py-1 text-sm">
						<span class="min-w-24">{photo.isCover ? 'Обложка' : `Фото ${index + 1}`}</span>
						{#each [-1, 1] as shift (shift)}
							{#if index + shift >= 0 && index + shift < ids.length}
								<form
									method="POST"
									action="?/mediaOrder"
									use:enhance={withToast({ success: 'Порядок сохранён' })}
								>
									{#each moved(index, shift) as id (id)}<input
											type="hidden"
											name="mediaId"
											value={id}
										/>{/each}
									<Button type="submit" variant="secondary" size="sm"
										>{shift < 0 ? 'Выше' : 'Ниже'}</Button
									>
								</form>
							{/if}
						{/each}
						<form
							method="POST"
							action="?/mediaRemove"
							use:enhance={withToast({ success: 'Фото удалено' })}
						>
							<input type="hidden" name="id" value={photo.id} /><Button
								type="submit"
								variant="danger"
								size="sm">Удалить</Button
							>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
	</Card.Content></Card.Root
>
