<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button, buttonVariants } from '$lib/ui';
	import TelLink from './TelLink.svelte';

	let { phone, telHref }: { phone: string | null; telHref: `tel:${string}` | null } = $props();
</script>

<header class="sticky top-0 z-10 bg-surface px-4 pt-4 pb-2 sm:px-6">
	<div
		data-testid="landing-header"
		class="mx-auto flex h-16 max-w-shell items-center gap-4 rounded-card bg-surface-raised pr-3 pl-5 sm:h-20 sm:pr-5 sm:pl-7"
	>
		<a
			href={resolve('/')}
			data-testid="home-logo"
			class="flex items-baseline gap-2.5 rounded-sm hover:text-link"
		>
			<span class="font-heading text-2xl font-semibold tracking-[0.14em]">АНГЕЛ</span>
			<span class="hidden text-[0.6875rem] tracking-[0.1em] text-fg-faint uppercase sm:inline">
				мастерская
			</span>
		</a>

		<div class="ml-auto flex items-center gap-2">
			{#if phone && telHref}
				<TelLink
					href={telHref}
					class={buttonVariants({ variant: 'secondary', class: 'hidden sm:inline-flex' })}
				>
					{phone}
				</TelLink>
			{/if}
			<Button href={resolve('/login')}>
				<!-- The full caption does not fit next to the brand on a 390 px phone. -->
				<span class="sm:hidden">Вход</span>
				<span class="hidden sm:inline">Вход для контрагентов</span>
			</Button>
		</div>
	</div>
</header>
