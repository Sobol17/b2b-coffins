import { ConflictError } from '../core/errors';
import type { Tx } from '../db/client';
import { PayrollCalendar } from './payroll-calendar';
import { PayrollPeriodRepository, type PeriodRow } from './payroll-period.repository';

/**
 * The rule every write of a day or an adjustment passes (tech.md v1.48): the week of the date is
 * open. The period row appears with the first write of its week.
 */
export class PayrollPeriodGate {
	constructor(
		private readonly calendar: PayrollCalendar = new PayrollCalendar(),
		private readonly periods: PayrollPeriodRepository = new PayrollPeriodRepository()
	) {}

	/** The period of the week that holds the date, when the week already has one. */
	find(date: string, tx?: Tx): PeriodRow | undefined {
		const startsOn = this.calendar.weekStartOf(date);
		return this.periods.findByStart(this.calendar.instantOf(startsOn), tx);
	}

	/** @throws ConflictError when the week of the date is closed or paid. */
	requireOpen(date: string, tx: Tx): number {
		const startsOn = this.calendar.weekStartOf(date);
		const start = this.calendar.instantOf(startsOn);
		const period = this.periods.findByStart(start, tx);
		if (!period) {
			const end = this.calendar.instantOf(this.calendar.weekEndOf(startsOn));
			return this.periods.insert(start, end, tx);
		}
		if (period.status !== 'open') {
			throw new ConflictError('Неделя закрыта. Откройте её, чтобы внести изменения');
		}
		return period.id;
	}
}
