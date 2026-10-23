import { and, eq, isNull } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { financeEntries } from '../db/schema';
import type { FinanceKind } from '$lib/types/finance';

export interface FinanceEntryRow {
	readonly id: number;
	readonly kind: FinanceKind;
	readonly amountMinor: number;
	readonly occurredAt: Date;
	readonly comment: string;
}
export interface FinanceEntryPatch {
	readonly kind: FinanceKind;
	readonly amountMinor: number;
	readonly occurredAt: Date;
	readonly comment: string;
}
export interface NewFinanceEntry extends FinanceEntryPatch {
	readonly createdById: number;
}

const COLUMNS = {
	id: financeEntries.id,
	kind: financeEntries.kind,
	amountMinor: financeEntries.amountMinor,
	occurredAt: financeEntries.occurredAt,
	comment: financeEntries.comment
};

/** The owner's manual entries. A deleted row stays for the journal and is invisible everywhere else. */
export class FinanceEntryRepository extends BaseRepository<typeof financeEntries> {
	constructor() {
		super(financeEntries);
	}

	findLive(id: number, tx?: Tx): FinanceEntryRow | undefined {
		const [row] = this.db(tx)
			.select(COLUMNS)
			.from(financeEntries)
			.where(and(eq(financeEntries.id, id), isNull(financeEntries.deletedAt)))
			.all();
		return row;
	}

	insert(entry: NewFinanceEntry, tx: Tx): number {
		const [row] = this.db(tx)
			.insert(financeEntries)
			.values(entry)
			.returning({ id: financeEntries.id })
			.all();
		if (!row) throw new Error('failed to write a finance entry');
		return row.id;
	}

	update(id: number, patch: FinanceEntryPatch, tx: Tx): void {
		this.db(tx).update(financeEntries).set(patch).where(eq(financeEntries.id, id)).run();
	}

	softDelete(id: number, at: Date, tx: Tx): void {
		this.db(tx)
			.update(financeEntries)
			.set({ deletedAt: at })
			.where(eq(financeEntries.id, id))
			.run();
	}
}
