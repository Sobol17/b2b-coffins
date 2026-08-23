<script lang="ts">
	import { REQUEST_STATUS_FLOW, REQUEST_STATUS_META } from './status';
	import { formatDateTime } from '$lib/utils/format';
	import type { RequestStatus } from '$lib/types/request';

	let {
		current,
		reachedAt = {},
		timeZone = 'UTC'
	}: {
		current: RequestStatus;
		reachedAt?: Partial<Record<RequestStatus, string>>;
		timeZone?: string;
	} = $props();

	// A request that left the flow (cancelled, rejected) has no place on it, so nothing is marked.
	const currentIndex = $derived(REQUEST_STATUS_FLOW.indexOf(current));
</script>

<ol data-slot="stepper" class="flex flex-wrap gap-x-6 gap-y-3">
	{#each REQUEST_STATUS_FLOW as status, index (status)}
		{@const passed = currentIndex >= 0 && index <= currentIndex}
		{@const at = reachedAt[status]}
		<li class="flex items-center gap-2" data-step={status} data-passed={passed}>
			<span
				aria-hidden="true"
				class={[
					'size-2.5 rounded-full',
					passed ? 'bg-brand' : 'border border-border-strong bg-surface'
				]}
			></span>
			<span class="flex flex-col">
				<span class={['text-sm', passed ? 'text-fg' : 'text-fg-muted']}>
					{REQUEST_STATUS_META[status].label}
				</span>
				{#if at}
					<time datetime={at} class="text-xs text-fg-muted">{formatDateTime(at, timeZone)}</time>
				{/if}
			</span>
		</li>
	{/each}
</ol>
