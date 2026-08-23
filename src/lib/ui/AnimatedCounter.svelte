<script lang="ts">
	import { formatMinor } from '$lib/utils/format';

	let {
		valueMinor,
		durationMs = 900,
		class: className
	}: { valueMinor: number; durationMs?: number; class?: string } = $props();

	/*
	 * Server render and first paint show the final number: the count-up is decoration, and a
	 * donation banner that starts at zero without javascript would state something untrue.
	 * `previous` stays a plain variable so the effect never reads the state it writes (tech.md 15.6).
	 */
	let animated = $state<number | null>(null);
	let previous: number | null = null;
	const shown = $derived(animated ?? valueMinor);

	$effect(() => {
		const target = valueMinor;
		const from = previous ?? target;
		previous = target;
		if (from === target || durationMs <= 0) {
			animated = target;
			return;
		}

		const startedAt = performance.now();
		let frame = requestAnimationFrame(function step(now: number) {
			const progress = Math.min(1, (now - startedAt) / durationMs);
			animated = Math.round(from + (target - from) * progress);
			if (progress < 1) frame = requestAnimationFrame(step);
		});

		return () => cancelAnimationFrame(frame);
	});
</script>

<span data-slot="animated-counter" class={['tabular-nums', className]}>{formatMinor(shown)}</span>
