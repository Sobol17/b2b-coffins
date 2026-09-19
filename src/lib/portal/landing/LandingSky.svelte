<script lang="ts">
	/**
	 * Decorative sky behind the landing (tech.md 18.2). The layer is vector, so it stays crisp on a
	 * retina screen and on a projector alike, and it is fixed, so the gradient always spans exactly
	 * one viewport instead of stretching over the whole scroll height.
	 *
	 * Cloud edges come from a radial gradient rather than feGaussianBlur: a filter over the full
	 * screen costs noticeably more on weak hardware and the result reads the same.
	 */
	type Puff = { cx: number; rx: number; ry: number };
	type Cloud = { opacity: number; base: number; puffs: Puff[] };

	// Depth reads through density, not through colour: the high clouds are the faintest.
	const wide: readonly Cloud[] = [
		{
			opacity: 0.16,
			base: 190,
			puffs: [
				{ cx: 274, rx: 104, ry: 34 },
				{ cx: 356, rx: 88, ry: 58 },
				{ cx: 438, rx: 74, ry: 42 },
				{ cx: 502, rx: 92, ry: 28 }
			]
		},
		{
			opacity: 0.16,
			base: 156,
			puffs: [
				{ cx: 1006, rx: 116, ry: 30 },
				{ cx: 1092, rx: 82, ry: 52 },
				{ cx: 1172, rx: 96, ry: 36 }
			]
		},
		{
			opacity: 0.24,
			base: 436,
			puffs: [
				{ cx: 480, rx: 118, ry: 38 },
				{ cx: 578, rx: 122, ry: 72 },
				{ cx: 684, rx: 96, ry: 54 },
				{ cx: 772, rx: 116, ry: 34 }
			]
		},
		{
			opacity: 0.24,
			base: 512,
			puffs: [
				{ cx: 1186, rx: 128, ry: 36 },
				{ cx: 1282, rx: 98, ry: 64 },
				{ cx: 1368, rx: 108, ry: 40 }
			]
		},
		{
			opacity: 0.3,
			base: 762,
			puffs: [
				{ cx: 204, rx: 156, ry: 44 },
				{ cx: 328, rx: 130, ry: 86 },
				{ cx: 448, rx: 112, ry: 60 },
				{ cx: 552, rx: 140, ry: 38 }
			]
		},
		{
			opacity: 0.3,
			base: 844,
			puffs: [
				{ cx: 902, rx: 168, ry: 46 },
				{ cx: 1040, rx: 138, ry: 90 },
				{ cx: 1168, rx: 118, ry: 62 },
				{ cx: 1278, rx: 150, ry: 40 }
			]
		}
	];

	// A phone crops the wide field down to a third of its width, so the narrow screen gets its own
	// arrangement in a viewBox close to a phone's own ratio.
	const narrow: readonly Cloud[] = [
		{
			opacity: 0.16,
			base: 210,
			puffs: [
				{ cx: 96, rx: 74, ry: 26 },
				{ cx: 156, rx: 62, ry: 44 },
				{ cx: 216, rx: 58, ry: 30 }
			]
		},
		{
			opacity: 0.24,
			base: 470,
			puffs: [
				{ cx: 232, rx: 86, ry: 30 },
				{ cx: 300, rx: 74, ry: 52 },
				{ cx: 366, rx: 78, ry: 34 }
			]
		},
		{
			opacity: 0.3,
			base: 792,
			puffs: [
				{ cx: 84, rx: 96, ry: 34 },
				{ cx: 166, rx: 82, ry: 62 },
				{ cx: 250, rx: 74, ry: 42 },
				{ cx: 324, rx: 92, ry: 28 }
			]
		}
	];
</script>

{#snippet field(clouds: readonly Cloud[], hazeAt: number, width: number, height: number)}
	{#each clouds as cloud, index (index)}
		<g opacity={cloud.opacity}>
			<!-- Every puff sits on the same baseline: a cumulus is flat below and bumpy above. -->
			{#each cloud.puffs as puff (puff.cx)}
				<ellipse
					cx={puff.cx}
					cy={cloud.base - puff.ry}
					rx={puff.rx}
					ry={puff.ry}
					fill="url(#landing-cloud-body)"
				/>
			{/each}
		</g>
	{/each}
	<!-- Haze on the horizon: the field has to lift into white where the page ends. -->
	<rect x="0" y={hazeAt} {width} height={height - hazeAt} fill="url(#landing-haze)" />
{/snippet}

<div
	class="sky pointer-events-none fixed inset-0 -z-10"
	data-testid="landing-sky"
	aria-hidden="true"
>
	<!-- Paint servers live in their own element: both fields reference them, and only one renders. -->
	<svg class="absolute h-0 w-0" xmlns="http://www.w3.org/2000/svg" focusable="false">
		<defs>
			<radialGradient id="landing-cloud-body" cx="50%" cy="58%" r="54%">
				<stop offset="0%" stop-color="var(--color-surface-raised)" stop-opacity="1" />
				<stop offset="52%" stop-color="var(--color-surface-raised)" stop-opacity="0.82" />
				<stop offset="100%" stop-color="var(--color-surface-raised)" stop-opacity="0" />
			</radialGradient>
			<linearGradient id="landing-haze" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0%" stop-color="var(--color-surface-raised)" stop-opacity="0" />
				<stop offset="100%" stop-color="var(--color-surface-raised)" stop-opacity="0.28" />
			</linearGradient>
		</defs>
	</svg>

	<svg
		class="hidden h-full w-full sm:block"
		viewBox="0 0 1440 960"
		preserveAspectRatio="xMidYMid slice"
		xmlns="http://www.w3.org/2000/svg"
		focusable="false"
	>
		{@render field(wide, 720, 1440, 960)}
	</svg>

	<svg
		class="h-full w-full sm:hidden"
		viewBox="0 0 480 900"
		preserveAspectRatio="xMidYMid slice"
		xmlns="http://www.w3.org/2000/svg"
		focusable="false"
	>
		{@render field(narrow, 660, 480, 900)}
	</svg>
</div>

<style>
	/* Tokens of the palette of tech.md 18.2. The sky darkens upward, the horizon stays pale. */
	.sky {
		background: linear-gradient(
			to bottom,
			var(--color-brand-300) 0%,
			var(--color-brand-150) 52%,
			var(--color-brand-100) 100%
		);
	}
</style>
