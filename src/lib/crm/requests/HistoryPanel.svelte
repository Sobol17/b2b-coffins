<script lang="ts">
	import { Card } from '$lib/ui';
	import { REQUEST_STATUS_META } from '$lib/ui/status';
	import type { RequestHistoryStepDto } from '$lib/types/request';
	import { formatDateTime } from '$lib/utils/format';

	/** Moves and workshop notes; a note keeps the status and says what changed (tech.md v1.40). */
	let { steps, timeZone }: { steps: readonly RequestHistoryStepDto[]; timeZone: string } = $props();

	function title(step: RequestHistoryStepDto): string {
		if (step.fromStatus === step.toStatus) return 'Изменение';
		return REQUEST_STATUS_META[step.toStatus].label;
	}
</script>

<Card.Root>
	<Card.Header><Card.Title>История</Card.Title></Card.Header>
	<Card.Content>
		<ol class="flex flex-col gap-3" data-testid="request-history">
			{#each [...steps].reverse() as step (step.id)}
				<li class="rounded-inset bg-surface-muted px-4 py-2">
					<div class="flex flex-wrap items-baseline gap-2">
						<span class="font-medium">{title(step)}</span>
						<time class="text-xs text-fg-muted" datetime={step.createdAt}>
							{formatDateTime(step.createdAt, timeZone)}
						</time>
						<span class="text-xs text-fg-muted">{step.actorName ?? 'Система'}</span>
					</div>
					{#if step.reasonTitle}<div class="text-sm">Причина: {step.reasonTitle}</div>{/if}
					{#if step.comment}<div class="text-sm text-fg-muted">{step.comment}</div>{/if}
				</li>
			{/each}
		</ol>
	</Card.Content>
</Card.Root>
