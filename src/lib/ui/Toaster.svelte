<script lang="ts" module>
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import InfoIcon from '@lucide/svelte/icons/info';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import type { ToastKind } from './toast.svelte';

	// One dictionary for the look of a kind, so a new kind cannot ship half-styled.
	const KIND_META = {
		success: {
			icon: CircleCheckIcon,
			label: 'Готово',
			tone: 'text-tone-success',
			badge: 'bg-tone-success-soft'
		},
		info: {
			icon: InfoIcon,
			label: 'Информация',
			tone: 'text-tone-info',
			badge: 'bg-tone-info-soft'
		},
		warning: {
			icon: TriangleAlertIcon,
			label: 'Внимание',
			tone: 'text-tone-warning',
			badge: 'bg-tone-warning-soft'
		},
		error: {
			icon: CircleAlertIcon,
			label: 'Ошибка',
			tone: 'text-tone-danger',
			badge: 'bg-tone-danger-soft'
		}
	} as const satisfies Record<ToastKind, object>;
</script>

<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';
	import { prefersReducedMotion } from 'svelte/motion';
	import { fly } from 'svelte/transition';
	import Button from '$lib/ui/base/button/button.svelte';
	import { toast } from './toast.svelte';

	const motion = $derived(prefersReducedMotion.current ? 0 : 180);
</script>

<!--
	Mounted once in the root layout; every screen pushes through toast.success / error / info / warning.
	Phones get a full-width stack above the thumb zone, wide screens a corner that keeps forms clear.
-->
<section
	data-slot="toaster"
	aria-label="Уведомления"
	class="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-stretch gap-2 p-4 sm:inset-x-auto sm:right-0 sm:w-[26rem] sm:items-end"
>
	{#each toast.items as item (item.id)}
		{@const meta = KIND_META[item.kind]}
		<div
			data-testid="toast"
			data-kind={item.kind}
			role={item.kind === 'error' ? 'alert' : 'status'}
			aria-atomic="true"
			class="pointer-events-auto flex w-full items-start gap-3 rounded-card bg-surface-raised py-3 pr-2 pl-3 text-fg shadow-overlay"
			onmouseenter={() => toast.pause(item.id)}
			onmouseleave={() => toast.resume(item.id)}
			onfocusin={() => toast.pause(item.id)}
			onfocusout={() => toast.resume(item.id)}
			in:fly={{ y: 16, duration: motion }}
			out:fly={{ x: 24, duration: motion }}
		>
			<span
				aria-hidden="true"
				class={['grid size-9 shrink-0 place-items-center rounded-pill', meta.badge, meta.tone]}
			>
				<meta.icon class="size-5" />
			</span>
			<div class="flex min-w-0 flex-1 flex-col gap-1 pt-1.5">
				<p class="font-medium break-words">
					<span class="sr-only">{`${meta.label}: `}</span>{item.title}
				</p>
				{#if item.description}
					<p data-testid="toast-description" class="text-sm break-words text-fg-muted">
						{item.description}
					</p>
				{/if}
				{#if item.action}
					<a
						href={item.action.href}
						class="self-start text-sm font-medium text-link underline-offset-4 hover:text-link-hover hover:underline"
						onclick={() => toast.dismiss(item.id)}
					>
						{item.action.label}
					</a>
				{/if}
			</div>
			<Button
				variant="ghost"
				size="sm"
				class="size-9.5 shrink-0 px-0 text-fg-muted"
				aria-label="Закрыть уведомление"
				onclick={() => toast.dismiss(item.id)}
			>
				<XIcon />
			</Button>
		</div>
	{/each}
</section>
