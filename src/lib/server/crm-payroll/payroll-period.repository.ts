import { asc, eq } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { payrollLines, payrollPeriods, staff, users } from '../db/schema';
import type { PayrollPeriodStatus } from '$lib/types/crm-payroll';

export interface PeriodRow {
	readonly id: number;
	readonly startsOn: Date;
	readonly endsOn: Date;
	readonly status: PayrollPeriodStatus;
	readonly closedAt: Date | null;
	readonly closedByName: string | null;
}

export interface LineRow {
	readonly id: number;
	readonly periodId: number;
	readonly staffId: number;
	readonly fullName: string;
	readonly position: string | null;
	readonly daysWorked: number;
	readonly accruedMinor: number;
	readonly adjustmentMinor: number;
	readonly adjustmentComment: string | null;
	readonly payoutMinor: number;
	readonly paidAt: Date | null;
	readonly paidComment: string | null;
}

export type LinePatch = Partial<
	Pick<
		LineRow,
		| 'daysWorked'
		| 'accruedMinor'
		| 'adjustmentMinor'
		| 'adjustmentComment'
		| 'payoutMinor'
		| 'paidAt'
		| 'paidComment'
	>
>;

const PERIOD = {
	id: payrollPeriods.id,
	startsOn: payrollPeriods.startsOn,
	endsOn: payrollPeriods.endsOn,
	status: payrollPeriods.status,
	closedAt: payrollPeriods.closedAt,
	closedByName: users.fullName
};

const LINE = {
	id: payrollLines.id,
	periodId: payrollLines.periodId,
	staffId: payrollLines.staffId,
	fullName: staff.fullName,
	position: staff.position,
	daysWorked: payrollLines.daysWorked,
	accruedMinor: payrollLines.accruedMinor,
	adjustmentMinor: payrollLines.adjustmentMinor,
	adjustmentComment: payrollLines.adjustmentComment,
	payoutMinor: payrollLines.payoutMinor,
	paidAt: payrollLines.paidAt,
	paidComment: payrollLines.paidComment
};

/** Payroll weeks and their lines. An open week keeps only adjustments here (tech.md v1.48). */
export class PayrollPeriodRepository extends BaseRepository<typeof payrollPeriods> {
	constructor() {
		super(payrollPeriods);
	}

	private periods(tx?: Tx) {
		return this.db(tx)
			.select(PERIOD)
			.from(payrollPeriods)
			.leftJoin(users, eq(users.id, payrollPeriods.closedById));
	}

	findByStart(startsOn: Date, tx?: Tx): PeriodRow | undefined {
		return this.periods(tx).where(eq(payrollPeriods.startsOn, startsOn)).all()[0];
	}

	find(id: number, tx?: Tx): PeriodRow | undefined {
		return this.periods(tx).where(eq(payrollPeriods.id, id)).all()[0];
	}

	insert(startsOn: Date, endsOn: Date, tx: Tx): number {
		const [created] = this.db(tx)
			.insert(payrollPeriods)
			.values({ startsOn, endsOn })
			.returning({ id: payrollPeriods.id })
			.all();
		if (!created) throw new Error('failed to insert a payroll period');
		return created.id;
	}

	setStatus(
		id: number,
		patch: { status: PayrollPeriodStatus; closedById?: number | null; closedAt?: Date | null },
		tx: Tx
	): void {
		this.db(tx).update(payrollPeriods).set(patch).where(eq(payrollPeriods.id, id)).run();
	}

	lines(periodId: number, tx?: Tx): LineRow[] {
		return this.db(tx)
			.select(LINE)
			.from(payrollLines)
			.innerJoin(staff, eq(staff.id, payrollLines.staffId))
			.where(eq(payrollLines.periodId, periodId))
			.orderBy(asc(staff.fullName), asc(staff.id))
			.all();
	}

	findLine(id: number, tx?: Tx): LineRow | undefined {
		return this.db(tx)
			.select(LINE)
			.from(payrollLines)
			.innerJoin(staff, eq(staff.id, payrollLines.staffId))
			.where(eq(payrollLines.id, id))
			.all()[0];
	}

	upsertLine(periodId: number, staffId: number, patch: LinePatch, tx: Tx): void {
		this.db(tx)
			.insert(payrollLines)
			.values({ periodId, staffId, ...patch })
			.onConflictDoUpdate({ target: [payrollLines.periodId, payrollLines.staffId], set: patch })
			.run();
	}

	updateLine(id: number, patch: LinePatch, tx: Tx): void {
		this.db(tx).update(payrollLines).set(patch).where(eq(payrollLines.id, id)).run();
	}

	deleteLine(id: number, tx: Tx): void {
		this.db(tx).delete(payrollLines).where(eq(payrollLines.id, id)).run();
	}
}
