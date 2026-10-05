<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, DataTable, withToast, type DataTableColumn } from '$lib/ui';
	import type { PayrollLineDto, PayrollWeekDto } from '$lib/types/crm-payroll';
	import { formatDate } from '$lib/utils/format';
	import { roubles, signedRoubles } from './labels';

	/* The sheet of a week: one row per worker. Buttons follow the status of the week. */
	let {
		week,
		timezone,
		onAdjust,
		onPay
	}: {
		week: PayrollWeekDto;
		timezone: string;
		onAdjust: (line: PayrollLineDto) => void;
		onPay: (line: PayrollLineDto) => void;
	} = $props();

	const columns = $derived<DataTableColumn[]>([
		{ key: 'fullName', label: 'Сотрудник' },
		{ key: 'daysWorked', label: 'Дней', align: 'end' },
		{ key: 'accrued', label: 'Начислено', align: 'end' },
		{ key: 'adjustment', label: 'Корректировка', align: 'end' },
		{ key: 'payout', label: 'К выплате', align: 'end' },
		...(week.status === 'open' ? [] : [{ key: 'paid', label: 'Выплата' }]),
		...(week.canManage ? [{ key: 'actions', label: 'Действия', align: 'end' as const }] : [])
	]);
	// The table keys rows by `id`, and a line of an open week may not be stored yet: the row is
	// keyed by the worker and carries the line untouched.
	const rows = $derived(week.lines.map((line) => ({ id: line.staffId, line })));
	type Row = (typeof rows)[number];
	const query = $derived({ page: 1, perPage: Math.max(1, rows.length) });
</script>

<DataTable
	{columns}
	{rows}
	total={rows.length}
	{query}
	onQueryChange={() => undefined}
	emptyTitle="В неделе никто не работал"
>
	{#snippet cell(row: Row, column: DataTableColumn)}
		{#if column.key === 'fullName'}
			<div>{row.line.fullName}</div>
			{#if row.line.position}<div class="text-xs text-fg-muted">{row.line.position}</div>{/if}
		{:else if column.key === 'daysWorked'}
			<span class="tabular-nums">{row.line.daysWorked}</span>
		{:else if column.key === 'accrued'}
			<span class="tabular-nums">{roubles(row.line.accruedMinor)}</span>
		{:else if column.key === 'adjustment'}
			{#if row.line.adjustmentMinor === 0}
				<span class="text-fg-muted">—</span>
			{:else}
				<div class="tabular-nums">{signedRoubles(row.line.adjustmentMinor)}</div>
				<div class="text-xs text-fg-muted">{row.line.adjustmentComment}</div>
			{/if}
		{:else if column.key === 'payout'}
			<span class="font-medium tabular-nums" data-testid="line-payout">
				{roubles(row.line.payoutMinor)}
			</span>
		{:else if column.key === 'paid'}
			{#if row.line.paidAt}
				<div data-testid="line-paid">Выплачено {formatDate(row.line.paidAt, timezone)}</div>
				{#if row.line.paidComment}<div class="text-xs text-fg-muted">
						{row.line.paidComment}
					</div>{/if}
			{:else}
				<span class="text-fg-muted">{row.line.payoutMinor > 0 ? 'Не выплачено' : '—'}</span>
			{/if}
		{:else if column.key === 'actions'}
			<div class="flex flex-wrap justify-end gap-2">
				{#if week.status === 'open'}
					<Button variant="secondary" size="sm" onclick={() => onAdjust(row.line)}
						>Корректировка</Button
					>
				{:else if row.line.paidAt && row.line.id !== null}
					<form
						method="POST"
						action="?/unpay"
						use:enhance={withToast({ success: 'Отметка выплаты снята' })}
					>
						<input type="hidden" name="lineId" value={row.line.id} />
						<Button type="submit" variant="ghost" size="sm" class="text-danger">
							Снять отметку
						</Button>
					</form>
				{:else if row.line.payoutMinor > 0}
					<Button variant="secondary" size="sm" onclick={() => onPay(row.line)}>Выплачено</Button>
				{/if}
			</div>
		{/if}
	{/snippet}
</DataTable>
