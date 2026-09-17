<script lang="ts">
	import { resolve } from '$app/paths';
	import { Card, DataTable, PriceCell, StatusBadge, type DataTableColumn } from '$lib/ui';
	import type { RequestListItemDto } from '$lib/types/request';
	import { formatDayMonth, pluralRu } from '$lib/utils/format';

	/** The "active requests" panel of the portal home, laid out after the mockup table. */
	let {
		rows,
		total,
		timeZone
	}: {
		rows: readonly RequestListItemDto[];
		total: number;
		timeZone: string;
	} = $props();

	const columns: DataTableColumn[] = [
		{ key: 'number', label: 'Заявка' },
		{ key: 'status', label: 'Статус' },
		{ key: 'composition', label: 'Состав' },
		{ key: 'total', label: 'Сумма' },
		{ key: 'readiness', label: 'Готовность' }
	];

	// The home shows a short list and sends the reader to the registry for the rest: no paging here.
	const query = $derived({ page: 1, perPage: Math.max(rows.length, 1) });

	function readiness(row: RequestListItemDto): string {
		if (row.deliveredAt) return `доставлена ${formatDayMonth(row.deliveredAt, timeZone)}`;
		if (row.readyAt) return `готова ${formatDayMonth(row.readyAt, timeZone)}`;
		return '—';
	}
</script>

<Card.Root class="pt-7.5 pb-6">
	<Card.Content class="flex flex-col px-8">
		<div class="flex flex-wrap items-baseline gap-x-5 gap-y-1 px-2 pb-4.5">
			<h2 class="text-[28px]">Активные заявки</h2>
			<span data-testid="active-requests-count" class="text-sm text-fg-muted">
				{total}
				{pluralRu(total, ['заявка', 'заявки', 'заявок'])} в работе
			</span>
			<a
				href={resolve('/portal/requests')}
				class="ml-auto text-[14.5px] text-link hover:text-link-hover"
			>
				Все заявки →
			</a>
		</div>

		<div data-testid="active-requests">
			<DataTable
				{columns}
				{rows}
				total={rows.length}
				{query}
				onQueryChange={() => {}}
				emptyTitle="Активных заявок нет"
			>
				{#snippet cell(row: RequestListItemDto, column: DataTableColumn)}
					{#if column.key === 'number'}
						<a
							href={resolve(`/portal/requests/${row.id}`)}
							class="font-heading text-[19px] font-semibold hover:text-link"
						>
							{row.number}
						</a>
					{:else if column.key === 'composition'}
						<div>
							{row.itemCount}
							{pluralRu(row.itemCount, ['позиция', 'позиции', 'позиций'])} · {row.unitCount}
							{pluralRu(row.unitCount, ['изделие', 'изделия', 'изделий'])}
						</div>
						<div class="text-[13px] text-fg-faint">
							создана {formatDayMonth(row.submittedAt ?? row.createdAt, timeZone)}
						</div>
					{:else if column.key === 'total'}
						<span class="font-heading text-[19px] font-semibold">
							<PriceCell
								valueMinor={row.totalMinor}
							/>{#if row.totalMinor !== undefined}&nbsp;₽{/if}
						</span>
					{:else if column.key === 'readiness'}
						{readiness(row)}
					{:else if column.key === 'status'}
						<StatusBadge
							status={row.status}
							class="h-auto px-3.5 py-1.25 text-[13px] font-normal"
						/>
					{/if}
				{/snippet}
			</DataTable>
		</div>
	</Card.Content>
</Card.Root>
