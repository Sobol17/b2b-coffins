<script lang="ts">
	import type { LandingWorkDto } from '$lib/types/landing';

	/*
	 * Examples of the work (P13): the cover and the title of a published model. The photo comes
	 * from the public route, so a guest never touches `/api/files/[id]`.
	 */
	let { works }: { works: readonly LandingWorkDto[] } = $props();
</script>

{#if works.length > 0}
	<section id="works" class="mx-auto max-w-shell px-4 pt-12 sm:px-6">
		<h2 class="mb-5 px-2 text-3xl sm:text-4xl">Примеры работ</h2>
		<div class="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3">
			{#each works as work (work.coverMediaId)}
				<figure data-testid="landing-work" class="rounded-card bg-surface-raised p-3 sm:p-4">
					<img
						src="/api/public/works/{work.coverMediaId}"
						alt={work.title}
						loading="lazy"
						decoding="async"
						class="aspect-[4/3] w-full rounded-inset bg-surface-muted object-cover"
					/>
					<figcaption class="px-1 pt-3 text-fg-muted">{work.title}</figcaption>
				</figure>
			{/each}
		</div>
	</section>
{/if}
