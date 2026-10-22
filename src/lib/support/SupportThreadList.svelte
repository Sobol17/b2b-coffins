<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import { DataTable, TONE_CLASS, type DataTableColumn } from '$lib/ui';
	import type { ListQuery, Page } from '$lib/types/list';
	import type { SupportThreadListItemDto } from '$lib/types/support';
	import { formatDateTime } from '$lib/utils/format';
	import { supportState, type SupportContour } from './labels';

	/*
	 * The registry of support threads for both contours. The server already fenced and ordered the
	 * rows; the list only words the state for its reader.
	 */
	let {
		threads,
		query,
		onQueryChange,
		contour,
		showAuthor,
		timeZone,
		hrefOf
	}: {
		threads: Page<SupportThreadListItemDto>;
		query: ListQuery;
		onQueryChange: (next: ListQuery) => void;
		contour: SupportContour;
		showAuthor: boolean;
		timeZone: string;
		hrefOf: (id: number) => ResolvedPathname;
	} = $props();

	const columns = $derived<DataTableColumn[]>([
		// The state goes right after the subject: on a narrow screen it is the column that matters.
		{ key: 'subject', label: 'Обращение' },
		{ key: 'state', label: 'Статус' },
		...(contour === 'crm' ? [{ key: 'counterparty', label: 'Контрагент' }] : []),
		...(showAuthor ? [{ key: 'author', label: 'Автор' }] : []),
		{ key: 'request', label: 'Заявка' },
		{ key: 'last', label: 'Последнее сообщение', align: 'end' as const }
	]);
</script>

<DataTable
	{columns}
	rows={threads.rows}
	total={threads.total}
	{query}
	{onQueryChange}
	emptyTitle="Обращений не найдено"
>
	{#snippet cell(row: SupportThreadListItemDto, column: DataTableColumn)}
		{#if column.key === 'subject'}
			<a class="font-medium underline-offset-4 hover:underline" href={hrefOf(row.id)}>
				№{row.id}
				{row.subject}
			</a>
		{:else if column.key === 'counterparty'}
			{row.counterpartyName}
		{:else if column.key === 'author'}
			{row.authorName}
		{:else if column.key === 'request'}
			{row.requestNumber ?? '—'}
		{:else if column.key === 'state'}
			{@const shown = supportState(row, contour)}
			<span
				data-testid="support-state"
				class={['inline-flex rounded-pill px-2.5 py-0.5 text-xs', TONE_CLASS[shown.tone]]}
			>
				{shown.label}
			</span>
		{:else if column.key === 'last'}
			<time datetime={row.lastMessageAt}>{formatDateTime(row.lastMessageAt, timeZone)}</time>
		{/if}
	{/snippet}
</DataTable>
