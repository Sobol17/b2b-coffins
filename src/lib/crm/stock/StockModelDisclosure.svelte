<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { prefersReducedMotion } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { slide } from 'svelte/transition';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/ui';
	import type { StockRegistryRowDto } from '$lib/types/crm-stock';
	import StockDelete from './StockDelete.svelte';

	let {
		row,
		canManage,
		onEdit
	}: {
		row: StockRegistryRowDto;
		canManage: boolean;
		onEdit: ((item: StockRegistryRowDto['members'][number]) => void) | undefined;
	} = $props();

	const generatedId = $props.id();
	const panelId = `${generatedId}-positions`;
	let open = $state(false);
	let keyboard = $state(false);
	const duration = $derived(prefersReducedMotion.current || keyboard ? 0 : 180);

	function toggle(event: MouseEvent): void {
		keyboard = event.detail === 0;
		open = !open;
	}
</script>

<button
	type="button"
	class="group flex min-h-11 w-full items-center gap-2 rounded-lg text-left text-link outline-none hover:text-link-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
	aria-expanded={open}
	aria-controls={panelId}
	onclick={toggle}
>
	<span
		class="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-fg-muted group-hover:bg-chip group-hover:text-link"
		aria-hidden="true"
	>
		<span
			class="chevron inline-flex"
			style:transform={open ? 'rotate(90deg)' : 'rotate(0deg)'}
			style:transition-duration={`${duration}ms`}
		>
			<ChevronRight class="size-4" strokeWidth={1.75} />
		</span>
	</span>
	<span class="min-w-0 font-medium">
		{row.title}
		<span class="ml-1 text-xs font-normal text-fg-muted">· позиций: {row.members.length}</span>
	</span>
</button>

{#if canManage}
	<div class="mt-2 pl-3">
		<StockDelete id={row.id} title={row.title} modelId={row.modelId ?? undefined} />
	</div>
{/if}

<!-- Keep closing content out of keyboard navigation while its outro finishes. -->
<div id={panelId} inert={!open} aria-hidden={!open}>
	{#if open}
		<div transition:slide={{ duration, easing: cubicOut }}>
			<div class="flex flex-col gap-4 pt-3 pl-9">
				{#each row.members as member (member.id)}
					<div class="border-l border-border pl-3">
						<a class="text-link" href={resolve(`/crm/stock/${member.id}`)}
							>{member.variantLabels.join(', ') || member.title}</a
						>
						<p class="text-xs text-fg-muted">
							{member.code} · {member.balance}
							{member.unitTitle}
						</p>
						{#each member.positions as position (position.optionId)}
							<p class={['text-sm', position.balance < 0 ? 'text-danger' : 'text-fg-muted']}>
								{position.colorTitle ?? 'Без цвета'}: {position.balance}
							</p>
						{/each}
						{#if canManage}
							<div class="mt-2 flex flex-wrap gap-2">
								<Button variant="secondary" size="sm" onclick={() => onEdit?.(member)}
									>Изменить</Button
								>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.chevron {
		transition-property: transform;
		transition-timing-function: cubic-bezier(0.23, 1, 0.32, 1);
	}

	@media (prefers-reduced-motion: reduce) {
		.chevron {
			transition-property: none;
		}
	}
</style>
