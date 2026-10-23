import { sql, type SQL } from 'drizzle-orm';
import { offsetFor } from '../core/list';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { financeEntries } from '../db/schema';
import type { ReportWindow } from '$lib/domain/report/period';
import type { PaymentMethod } from '$lib/types/crm-counterparty';
import type { FinanceKind, FinanceSource } from '$lib/types/finance';
import type { ListQuery } from '$lib/types/list';

export interface FeedRow {
	readonly source: FinanceSource;
	readonly id: number;
	readonly occurredAt: Date;
	readonly signedMinor: number;
	readonly requestId: number | null;
	readonly requestNumber: string | null;
	readonly method: PaymentMethod | null;
	readonly isReversal: boolean;
	readonly staffName: string | null;
	readonly weekStartsAt: Date | null;
	readonly weekEndsAt: Date | null;
	readonly documentRef: string | null;
	readonly comment: string | null;
}
export interface FeedFilters {
	readonly kind: FinanceKind | null;
	readonly source: FinanceSource | null;
}

interface RawFeedRow {
	source: FinanceSource;
	id: number;
	occurredAt: number;
	signedMinor: number;
	requestId: number | null;
	requestNumber: string | null;
	method: PaymentMethod | null;
	isReversal: number;
	staffName: string | null;
	weekStartsAt: number | null;
	weekEndsAt: number | null;
	documentRef: string | null;
	comment: string | null;
}

/*
 * The four sources in one shape. Payments, payouts and transfers are read where they live, never
 * copied: their reversals and unmarking show up here by themselves. `rank` breaks ties of a day in
 * the FINANCE_SOURCES order. Timestamps are stored in seconds (drizzle `mode: 'timestamp'`).
 */
const FEED = sql`
	select 'order_payment' as source, 'income' as kind, 0 as rank, pm.id as id,
		pm.paid_at as occurred_at, pm.amount_minor as signed_minor, pm.request_id as request_id,
		r.number as request_number, pm.method as method, pm.reversal_of_id is not null as is_reversal,
		null as staff_name, null as week_starts_at, null as week_ends_at, null as document_ref,
		null as comment
	from payment_marks pm join requests r on r.id = pm.request_id
	union all
	select 'payroll', 'expense', 2, pl.id, pl.paid_at, -pl.payout_minor, null, null, null, 0,
		s.full_name, pp.starts_on, pp.ends_on, null, null
	from payroll_lines pl
		join staff s on s.id = pl.staff_id
		join payroll_periods pp on pp.id = pl.period_id
	where pl.paid_at is not null and pl.payout_minor > 0
	union all
	select 'charity', 'expense', 3, ct.id, ct.transferred_at, -ct.amount_minor, null, null, null,
		ct.reversal_of_id is not null, null, null, null, ct.document_ref, null
	from charity_transfers ct
	union all
	select case fe.kind when 'income' then 'manual_income' else 'manual_expense' end, fe.kind,
		case fe.kind when 'income' then 1 else 4 end, fe.id, fe.occurred_at,
		case fe.kind when 'income' then fe.amount_minor else -fe.amount_minor end, null, null, null, 0,
		null, null, null, null, fe.comment
	from finance_entries fe
	where fe.deleted_at is null`;

const COLUMNS = sql`source, id, occurred_at as occurredAt, signed_minor as signedMinor,
	request_id as requestId, request_number as requestNumber, method, is_reversal as isReversal,
	staff_name as staffName, week_starts_at as weekStartsAt, week_ends_at as weekEndsAt,
	document_ref as documentRef, comment`;

const seconds = (at: Date): number => Math.floor(at.getTime() / 1000);
const dateOf = (value: number | null): Date | null =>
	value === null ? null : new Date(value * 1000);

function toRow(raw: RawFeedRow): FeedRow {
	return {
		...raw,
		occurredAt: new Date(raw.occurredAt * 1000),
		isReversal: raw.isReversal === 1,
		weekStartsAt: dateOf(raw.weekStartsAt),
		weekEndsAt: dateOf(raw.weekEndsAt)
	};
}

/** Reads the money feed of a period: a page for the table, every line for the analytics. */
export class FinanceFeedRepository extends BaseRepository<typeof financeEntries> {
	constructor() {
		super(financeEntries);
	}

	private where(window: ReportWindow, filters: FeedFilters): SQL {
		const parts = [
			sql`occurred_at >= ${seconds(window.from)}`,
			sql`occurred_at < ${seconds(window.to)}`
		];
		if (filters.kind !== null) parts.push(sql`kind = ${filters.kind}`);
		if (filters.source !== null) parts.push(sql`source = ${filters.source}`);
		return sql.join(parts, sql` and `);
	}

	page(
		window: ReportWindow,
		filters: FeedFilters,
		query: Pick<ListQuery<unknown>, 'page' | 'perPage'>,
		tx?: Tx
	): { rows: FeedRow[]; total: number } {
		const where = this.where(window, filters);
		const rows = this.db(tx).all<RawFeedRow>(
			sql`with feed as (${FEED}) select ${COLUMNS} from feed where ${where}
				order by occurred_at desc, rank, id desc
				limit ${query.perPage} offset ${offsetFor({ ...query })}`
		);
		const [count] = this.db(tx).all<{ total: number }>(
			sql`with feed as (${FEED}) select count(*) as total from feed where ${where}`
		);
		return { rows: rows.map(toRow), total: count?.total ?? 0 };
	}

	lines(window: ReportWindow, tx?: Tx): FeedRow[] {
		const where = this.where(window, { kind: null, source: null });
		return this.db(tx)
			.all<RawFeedRow>(sql`with feed as (${FEED}) select ${COLUMNS} from feed where ${where}`)
			.map(toRow);
	}
}
