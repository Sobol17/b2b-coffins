import type { Tx } from '../db/client';
import { PayrollDtoMapper } from './dto';
import { PayrollCalendar } from './payroll-calendar';
import { PayrollPeriodRepository, type PeriodRow } from './payroll-period.repository';
import { PayrollStaffRepository } from './payroll-staff.repository';
import { ShopUnitWorkRepository } from '../crm-shop/shop-unit-work.repository';
import { WorkDayRepository, type WorkDayWithStaff } from './work-day.repository';
import { dayShares, payoutMinor, weekAccruals } from '$lib/domain/payroll/calc';
import type { PayrollDayCellDto, PayrollLineDto } from '$lib/types/crm-payroll';

export interface WeekSnapshot {
	readonly startsOn: string;
	readonly endsOn: string;
	readonly period: PeriodRow | undefined;
	readonly days: PayrollDayCellDto[];
	readonly lines: PayrollLineDto[];
}

/**
 * Reads one payroll week (tech.md v1.48). An open week is computed from its days on every read;
 * a closed one shows the lines frozen at the close, whatever the days say now.
 */
export class PayrollWeekReader {
	constructor(
		private readonly calendar: PayrollCalendar = new PayrollCalendar(),
		private readonly periods: PayrollPeriodRepository = new PayrollPeriodRepository(),
		private readonly workDays: WorkDayRepository = new WorkDayRepository(),
		private readonly staff: PayrollStaffRepository = new PayrollStaffRepository()
	) {}

	/** The week that holds the date. */
	read(date: string, tx?: Tx, ownStaffId?: number): WeekSnapshot {
		const startsOn = this.calendar.weekStartOf(date);
		const endsOn = this.calendar.weekEndOf(startsOn);
		const period = this.periods.findByStart(this.calendar.instantOf(startsOn), tx);
		const marked = this.workDays.between(
			this.calendar.instantOf(startsOn),
			this.calendar.instantOf(endsOn),
			tx,
			ownStaffId
		);
		const lines =
			period && period.status !== 'open'
				? this.periods.lines(period.id, tx, ownStaffId).map((row) => PayrollDtoMapper.toLine(row))
				: this.liveLines(marked, period, tx, ownStaffId);
		const pending = new ShopUnitWorkRepository().pending(
			this.calendar.instantOf(startsOn),
			this.calendar.instantOf(endsOn),
			tx,
			ownStaffId
		);
		return { startsOn, endsOn, period, days: this.cells(startsOn, marked, pending), lines };
	}

	private cells(
		startsOn: string,
		marked: readonly WorkDayWithStaff[],
		pending: ReturnType<ShopUnitWorkRepository['pending']>
	): PayrollDayCellDto[] {
		const byDate = new Map(marked.map((day) => [this.calendar.dateOf(day.workDate), day]));
		return this.calendar.weekDatesOf(startsOn).map((date) => {
			const day = byDate.get(date);
			const awaiting = pending.filter((row) => this.calendar.dateOf(row.work.workDate!) === date);
			return {
				date,
				presentCount: day?.staffIds.length ?? 0,
				totalMinor: day?.totalMinor ?? 0,
				pendingCount: awaiting.length,
				pendingTotalMinor: awaiting.reduce((sum, row) => sum + row.work.rateMinor, 0)
			};
		});
	}

	/** Active staff plus anyone with a day or an adjustment in the week. */
	private liveLines(
		marked: readonly WorkDayWithStaff[],
		period: PeriodRow | undefined,
		tx?: Tx,
		ownStaffId?: number
	): PayrollLineDto[] {
		const accruals = new Map(
			weekAccruals(marked.map(withShares)).map((line) => [line.staffId, line])
		);
		const stored = new Map(
			(period ? this.periods.lines(period.id, tx, ownStaffId) : []).map((line) => [
				line.staffId,
				line
			])
		);
		return (ownStaffId === undefined ? this.staff.all(tx) : this.staff.byIds([ownStaffId], tx))
			.filter(
				(row) =>
					row.isActive || accruals.has(row.id) || (stored.get(row.id)?.adjustmentMinor ?? 0) !== 0
			)
			.map((row) => {
				const accrual = accruals.get(row.id);
				const line = stored.get(row.id);
				const accruedMinor = accrual?.accruedMinor ?? 0;
				const adjustmentMinor = line?.adjustmentMinor ?? 0;
				return {
					id: line?.id ?? null,
					staffId: row.id,
					fullName: row.fullName,
					position: row.position,
					daysWorked: accrual?.daysWorked ?? 0,
					accruedMinor,
					adjustmentMinor,
					adjustmentComment: line?.adjustmentComment ?? null,
					payoutMinor: payoutMinor(accruedMinor, adjustmentMinor),
					paidAt: null,
					paidComment: null
				};
			});
	}
}

/** A marked day with each worker's pay, counted from its crews as the day sheet counts it. */
export function withShares(day: WorkDayWithStaff) {
	return { staffIds: day.staffIds, shares: dayShares(day.staffIds, day.entries) };
}
