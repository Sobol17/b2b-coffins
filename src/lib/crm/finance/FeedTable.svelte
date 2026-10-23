<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import DeleteForm from '$lib/crm/counterparties/DeleteForm.svelte';
	import EntryModal from '$lib/crm/finance/EntryModal.svelte';
	import { FINANCE_SOURCE_TITLE, signedAmount } from '$lib/crm/finance/labels';
	import { roubles } from '$lib/crm/payroll/labels';
	import type { FinanceOperationDto } from '$lib/types/finance';
	import type { ListQuery, Page } from '$lib/types/list';
	import { Button, ConfirmDialog, DataTable, type DataTableColumn } from '$lib/ui';
	import { formatDate } from '$lib/utils/format';
	import { listQueryOf, withListQuery } from '$lib/utils/list-url';

	/*
	 * The feed of the period. An automatic line links to the screen that owns it, where it is
	 * corrected; only a manual line is edited and deleted here.
	 */
	let { feed, today }: { feed: Page<FinanceOperationDto>; today: string } = $props();

	const columns: DataTableColumn[] = [
		{ key: 'date', label: 'Дата' },
		{ key: 'source', label: 'Операция' },
		{ key: 'title', label: 'Описание' },
		{ key: 'amount', label: 'Сумма', align: 'end' },
		{ key: 'actions', label: '' }
	];
	const rows = $derived(feed.rows.map((row) => ({ ...row, id: row.key })));
	type Row = (typeof rows)[number];
	const query = $derived(listQueryOf(page.url, feed));

	let editing = $state<FinanceOperationDto | null>(null);
	let removing = $state<FinanceOperationDto | null>(null);
	let confirmOpen = $state(false);
	let deleteForm = $state<DeleteForm>();

	function changeQuery(next: ListQuery): void {
		// Same page with a rewritten query string, so there is no route pattern to resolve.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(withListQuery(page.url, next), { keepFocus: true, noScroll: true });
	}

	function askRemove(row: FinanceOperationDto): void {
		removing = row;
		confirmOpen = true;
	}

	// The dialog does not close itself on confirm: the hidden form posts, then the dialog closes.
	function confirmRemove(): void {
		deleteForm?.submit();
		confirmOpen = false;
	}
</script>

<div data-testid="finance-feed">
	<DataTable
		{columns}
		{rows}
		total={feed.total}
		{query}
		onQueryChange={changeQuery}
		emptyTitle="За период операций нет"
	>
		{#snippet cell(row: Row, column: DataTableColumn)}
			{#if column.key === 'date'}
				<span class="tabular-nums">{formatDate(`${row.occurredOn}T00:00:00Z`)}</span>
			{:else if column.key === 'source'}
				{FINANCE_SOURCE_TITLE[row.source]}
			{:else if column.key === 'title'}
				{#if row.href}
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the server builds the path of a known route -->
					<a class="text-link underline hover:text-link-hover" href={row.href}>{row.title}</a>
				{:else}
					<span class="break-words">{row.title}</span>
				{/if}
				{#if row.detail}<span class="block text-sm text-fg-muted">{row.detail}</span>{/if}
			{:else if column.key === 'amount'}
				<span
					class="whitespace-nowrap tabular-nums"
					class:text-success={row.signedMinor > 0}
					class:text-danger={row.signedMinor < 0}
				>
					{signedAmount(row.signedMinor, roubles)}
				</span>
			{:else if row.manualId !== null}
				<div class="flex justify-end gap-1">
					<Button variant="ghost" size="sm" onclick={() => (editing = row)}>Изменить</Button>
					<Button variant="ghost" size="sm" class="text-danger" onclick={() => askRemove(row)}>
						Удалить
					</Button>
				</div>
			{/if}
		{/snippet}
	</DataTable>
</div>

<EntryModal entry={editing} {today} onClose={() => (editing = null)} />
<DeleteForm
	bind:this={deleteForm}
	action="?/remove"
	id={removing?.manualId ?? undefined}
	success="Операция удалена"
/>
<ConfirmDialog
	bind:open={confirmOpen}
	title="Удалить операцию?"
	description="Итоги периода пересчитаются."
	confirmLabel="Удалить"
	danger
	onConfirm={confirmRemove}
/>
