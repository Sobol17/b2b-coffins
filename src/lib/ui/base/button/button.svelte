<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';
	import { cn, type WithElementRef } from '$lib/utils/cn.js';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
	import type { ResolvedPathname } from '$app/types';
	import type { Snippet } from 'svelte';

	/*
	 * Variants and sizes are the ones tech.md 9 names, not the shadcn defaults: the table in the
	 * core file is the contract every slice codes against.
	 */
	export const buttonVariants = tv({
		base: "group/button inline-flex shrink-0 items-center justify-center rounded-pill border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-danger aria-invalid:ring-3 aria-invalid:ring-danger/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		variants: {
			variant: {
				// Pills of tech.md 18.4: sky blue primary, grey chip secondary, link-coloured ghost.
				primary: 'bg-brand text-brand-fg hover:bg-brand-hover active:bg-brand-active',
				secondary: 'bg-chip text-fg hover:bg-chip-hover aria-expanded:bg-chip-hover',
				ghost:
					'text-brand hover:bg-surface-muted hover:text-brand-hover aria-expanded:bg-surface-muted',
				danger: 'bg-danger text-danger-fg hover:bg-danger/90'
			},
			size: {
				sm: 'h-9.5 gap-1.5 px-4 text-sm',
				md: 'h-11 gap-2 px-5 text-[0.9375rem]',
				lg: 'h-13 gap-2 px-7 text-base',
				// The shop floor and driver screens tap with gloves on: 44 px minimum (tech.md 16).
				touch: 'min-h-touch min-w-touch gap-2 px-5 text-base'
			}
		},
		defaultVariants: {
			variant: 'primary',
			size: 'md'
		}
	});

	export type ButtonVariant = VariantProps<typeof buttonVariants>['variant'];
	export type ButtonSize = VariantProps<typeof buttonVariants>['size'];

	export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
		WithElementRef<HTMLAnchorAttributes> & {
			variant?: ButtonVariant;
			size?: ButtonSize;
			loading?: boolean;
			// Typed routes only: a caller has to pass resolve('/route'), never a hand-built string.
			href?: ResolvedPathname;
			children?: Snippet;
		};
</script>

<script lang="ts">
	import Spinner from '../spinner/spinner.svelte';

	let {
		class: className,
		variant = 'primary',
		size = 'md',
		loading = false,
		ref = $bindable(null),
		href = undefined,
		type = 'button',
		disabled,
		children,
		...restProps
	}: ButtonProps = $props();

	// A pending action must not be submitted twice, so loading blocks the button by itself.
	const isBlocked = $derived(disabled === true || loading);
</script>

{#if href}
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- href is typed as ResolvedPathname, so the caller already resolved it -->
	<a
		bind:this={ref}
		data-slot="button"
		data-touch-target={size === 'touch' ? '' : undefined}
		class={cn(buttonVariants({ variant, size }), className)}
		href={isBlocked ? undefined : href}
		aria-disabled={isBlocked}
		aria-busy={loading}
		role={isBlocked ? 'link' : undefined}
		tabindex={isBlocked ? -1 : undefined}
		{...restProps}
	>
		{#if loading}<Spinner />{/if}
		{@render children?.()}
	</a>
{:else}
	<button
		bind:this={ref}
		data-slot="button"
		data-touch-target={size === 'touch' ? '' : undefined}
		class={cn(buttonVariants({ variant, size }), className)}
		{type}
		disabled={isBlocked}
		aria-busy={loading}
		{...restProps}
	>
		{#if loading}<Spinner />{/if}
		{@render children?.()}
	</button>
{/if}
