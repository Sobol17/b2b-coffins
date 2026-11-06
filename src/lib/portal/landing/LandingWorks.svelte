<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { Button } from '$lib/ui';
	import type { LandingWorkDto } from '$lib/types/landing';

	/*
	 * Examples of the work (P13): the cover and the title of a published model. The photo comes
	 * from the public route, so a guest never touches `/api/files/[id]`.
	 */
	let { works }: { works: readonly LandingWorkDto[] } = $props();
	const carouselId = $props.id();
	let viewport: HTMLDivElement | undefined = $state();
	let canPrevious = $state(false);
	let canNext = $state(false);

	function updateEdges(): void {
		if (!viewport) return;
		canPrevious = viewport.scrollLeft > 1;
		canNext = viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 1;
	}

	function scrollTo(left: number): void {
		viewport?.scrollTo({
			left,
			behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
		});
	}

	function move(direction: number): void {
		if (viewport) scrollTo(viewport.scrollLeft + direction * viewport.clientWidth);
	}

	onMount(() => {
		if (!viewport) return;
		const observer = new ResizeObserver(updateEdges);
		observer.observe(viewport);
		updateEdges();
		return () => observer.disconnect();
	});
</script>

{#if works.length > 0}
	<section id="works" class="mx-auto max-w-shell px-4 pt-12 sm:px-6">
		<div class="mb-5 flex flex-wrap items-center justify-between gap-3 px-2">
			<h2 class="text-3xl sm:text-4xl">Примеры работ</h2>
			<div class="flex items-center gap-2">
				<Button href={resolve('/catalog')} variant="secondary">Смотреть все</Button>
				<Button
					variant="ghost"
					aria-label="Предыдущие модели"
					aria-controls={carouselId}
					disabled={!canPrevious}
					onclick={() => move(-1)}
					class="px-3"><ChevronLeftIcon aria-hidden="true" /></Button
				>
				<Button
					variant="ghost"
					aria-label="Следующие модели"
					aria-controls={carouselId}
					disabled={!canNext}
					onclick={() => move(1)}
					class="px-3"><ChevronRightIcon aria-hidden="true" /></Button
				>
			</div>
		</div>
		<div
			id={carouselId}
			bind:this={viewport}
			role="region"
			aria-label="Примеры работ"
			aria-roledescription="карусель"
			onscroll={updateEdges}
			class="flex snap-x snap-mandatory gap-4 overflow-x-auto rounded-card pb-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring sm:gap-6"
		>
			{#each works as work (work.coverMediaId)}
				<figure
					data-testid="landing-work"
					class="w-[82%] shrink-0 snap-start rounded-card bg-surface-raised p-3 sm:w-[calc((100%_-_1.5rem)/2)] sm:p-4 lg:w-[calc((100%_-_3rem)/3)]"
				>
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
