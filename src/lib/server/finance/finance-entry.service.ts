import { PolicyService } from '../auth/policy';
import { NotFoundError, ValidationError } from '../core/errors';
import { BaseService } from '../core/service';
import type { Tx } from '../db/client';
import { OrgService } from '../settings/org.service';
import { FinanceEntryRepository, type FinanceEntryRow } from './finance-entry.repository';
import { startOfDayInZone } from '$lib/domain/time/zone';
import type { ActorContext } from '$lib/types/actor';
import { isoDay } from '$lib/utils/format';
import type {
	FinanceDeleteInput,
	FinanceEntryInput,
	FinanceEntryUpdateInput
} from '$lib/validation/finance';

const ENTITY = 'finance_entries';

/**
 * Manual income and expenses of the owner (C18, tech.md v1.58). Unlike payments and transfers an
 * entry is edited and deleted in place: it is the owner's own book, not a settlement with anyone.
 * Every change goes to audit_log with the old value, so a figure moved backwards stays traceable.
 */
export class FinanceEntryService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly entries: FinanceEntryRepository = new FinanceEntryRepository(),
		private readonly timeZone: string = OrgService.timezone(),
		private readonly now: () => Date = () => new Date()
	) {
		super(ctx);
		this.assert(ctx.scope === 'crm' && PolicyService.can(ctx, 'finance.manage'), 'finance.manage');
	}

	/** @throws ValidationError for a day the calendar lacks or a day after today. */
	create(input: FinanceEntryInput): number {
		const occurredAt = this.occurredAt(input.occurredOn);
		return this.audited({ action: 'finance.entry.create', entity: ENTITY }, (tx) => {
			const id = this.entries.insert(
				{ ...this.patchOf(input, occurredAt), createdById: this.ctx.userId },
				tx
			);
			return { result: id, entityId: id, after: this.snapshotOf(input) };
		});
	}

	/** @throws NotFoundError for an unknown or deleted entry, ValidationError as in create. */
	update(input: FinanceEntryUpdateInput): void {
		const occurredAt = this.occurredAt(input.occurredOn);
		this.audited({ action: 'finance.entry.update', entity: ENTITY }, (tx) => {
			const row = this.live(input.id, tx);
			this.entries.update(row.id, this.patchOf(input, occurredAt), tx);
			return {
				result: undefined,
				entityId: row.id,
				before: this.snapshotOfRow(row),
				after: this.snapshotOf(input)
			};
		});
	}

	/** @throws NotFoundError for an unknown or already deleted entry. */
	remove(input: FinanceDeleteInput): void {
		this.audited({ action: 'finance.entry.delete', entity: ENTITY }, (tx) => {
			const row = this.live(input.id, tx);
			this.entries.softDelete(row.id, this.now(), tx);
			return { result: undefined, entityId: row.id, before: this.snapshotOfRow(row) };
		});
	}

	private live(id: number, tx: Tx): FinanceEntryRow {
		const row = this.entries.findLive(id, tx);
		if (!row) throw new NotFoundError('finance_entry');
		return row;
	}

	private patchOf(input: FinanceEntryInput, occurredAt: Date) {
		return { kind: input.kind, amountMinor: input.amountMinor, occurredAt, comment: input.comment };
	}

	private snapshotOf(input: FinanceEntryInput): Record<string, unknown> {
		return {
			kind: input.kind,
			amountMinor: input.amountMinor,
			occurredOn: input.occurredOn,
			comment: input.comment
		};
	}

	private snapshotOfRow(row: FinanceEntryRow): Record<string, unknown> {
		return {
			kind: row.kind,
			amountMinor: row.amountMinor,
			occurredOn: isoDay(row.occurredAt.toISOString(), this.timeZone),
			comment: row.comment
		};
	}

	/** The day in the workshop zone; money is not booked for tomorrow. */
	private occurredAt(isoDate: string): Date {
		const at = startOfDayInZone(isoDate, this.timeZone);
		if (at === null) throw new ValidationError('Выберите дату', { field: 'occurredOn' });
		if (at.getTime() > this.now().getTime()) {
			throw new ValidationError('Дата не может быть позже сегодняшней', { field: 'occurredOn' });
		}
		return at;
	}
}
