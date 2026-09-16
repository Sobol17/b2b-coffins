<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button, Card, PriceCell, StatusBadge } from '$lib/ui';
	import { formatDate } from '$lib/utils/format';
	import type { RequestListItemDto } from '$lib/types/request';

	/** A row of the registry from the mockup: what the request is, where it stands and for how much. */
	let {
		row,
		timeZone,
		showAuthor
	}: {
		row: RequestListItemDto;
		timeZone: string;
		showAuthor: boolean;
	} = $props();
</script>

<Card.Root data-testid="request-row">
	<Card.Content class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div class="flex flex-col gap-1">
			<div class="flex flex-wrap items-center gap-3">
				<span class="text-lg">{row.number}</span>
				{#if row.submittedAt}
					<span class="text-fg-muted">{formatDate(row.submittedAt, timeZone)}</span>
				{/if}
				<StatusBadge status={row.status} />
			</div>
			<p class="text-fg">{row.firstItemTitle ?? 'Позиции не указаны'}</p>
			<p class="text-sm text-fg-muted">
				Позиций {row.itemCount} · изделий {row.unitCount}
				{#if row.externalNumber}· ваш номер {row.externalNumber}{/if}
				{#if showAuthor && row.authorName}· автор {row.authorName}{/if}
			</p>
		</div>

		<div class="flex items-center gap-4 sm:flex-col sm:items-end">
			{#if row.totalMinor !== undefined}
				<span class="text-lg"><PriceCell valueMinor={row.totalMinor} /> ₽</span>
			{/if}
			<Button variant="secondary" href={resolve(`/portal/requests/${row.id}`)}>Открыть</Button>
		</div>
	</Card.Content>
</Card.Root>
