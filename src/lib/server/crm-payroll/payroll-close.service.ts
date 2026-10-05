import { ConflictError, NotFoundError, ValidationError } from '../core/errors';
import type { Tx } from '../db/client';
import { bus } from '../events/bus';
import { PayrollBaseService } from './payroll-base.service';
import { PayrollCalendar } from './payroll-calendar';
import { PayrollPeriodRepository, type LineRow, type PeriodRow } from './payroll-period.repository';
import { PayrollWeekReader } from './payroll-week.reader';
import type { ActorContext } from '$lib/types/actor';
import type { PayrollPayInput, PayrollReopenInput } from '$lib/validation/crm-payroll';

/**
 * Closing a week, opening it again and marking payouts (tech.md v1.48). A closed week is the
 * sheet people were paid by: it changes only through a reopening that the journal records.
 */
export class PayrollCloseService extends PayrollBaseService {
	constructor(
		ctx: ActorContext,
		private readonly calendar: PayrollCalendar = new PayrollCalendar(),
		private readonly periods: PayrollPeriodRepository = new PayrollPeriodRepository(),
		private readonly reader: PayrollWeekReader = new PayrollWeekReader(calendar, periods)
	) {
		super(ctx);
		this.assertManage();
	}

	/**
	 * Freezes the lines of the week that holds the date.
	 * @throws ValidationError for a week with nothing to pay for or a payout below zero,
	 * ConflictError when the week is already closed.
	 */
	close(date: string): void {
		this.audited({ action: 'payroll.close', entity: 'payroll_periods' }, (tx) => {
			const week = this.reader.read(date, tx);
			if (week.period && week.period.status !== 'open') {
				throw new ConflictError('Неделя уже закрыта');
			}
			const lines = week.lines.filter((line) => line.daysWorked > 0 || line.adjustmentMinor !== 0);
			if (!week.period || lines.length === 0) {
				throw new ValidationError('В неделе нет отмеченных дней и корректировок');
			}
			const short = lines.find((line) => line.payoutMinor < 0);
			if (short) throw new ValidationError(`Удержание больше начисленного: ${short.fullName}`);
			const periodId = week.period.id;
			// A line that kept only a cleared adjustment has nothing to show on the sheet.
			for (const stale of week.lines) {
				if (stale.id !== null && !lines.includes(stale)) this.periods.deleteLine(stale.id, tx);
			}
			for (const line of lines) {
				const { daysWorked, accruedMinor, payoutMinor } = line;
				this.periods.upsertLine(
					periodId,
					line.staffId,
					{ daysWorked, accruedMinor, payoutMinor },
					tx
				);
			}
			const closedAt = this.calendar.moment();
			this.periods.setStatus(
				periodId,
				{ status: 'calculated', closedById: this.ctx.userId, closedAt },
				tx
			);
			bus.emit('payroll.week_closed', periodId, tx);
			const totalPayoutMinor = lines.reduce((sum, line) => sum + line.payoutMinor, 0);
			return {
				result: undefined,
				entityId: periodId,
				after: { startsOn: week.startsOn, lines: lines.length, totalPayoutMinor }
			};
		});
	}

	/**
	 * @throws NotFoundError for an unknown period, ConflictError for a week that is open or has a
	 * payout marked.
	 */
	reopen(input: PayrollReopenInput): void {
		this.audited({ action: 'payroll.reopen', entity: 'payroll_periods' }, (tx) => {
			const period = this.requirePeriod(input.periodId, tx);
			if (period.status === 'open') throw new ConflictError('Неделя уже открыта');
			if (this.periods.lines(period.id, tx).some((line) => line.paidAt !== null)) {
				throw new ConflictError('Сначала снимите отметки выплаты');
			}
			this.periods.setStatus(period.id, { status: 'open', closedById: null, closedAt: null }, tx);
			return {
				result: undefined,
				entityId: period.id,
				before: { status: period.status },
				after: { status: 'open', comment: input.comment }
			};
		});
	}

	/**
	 * @throws NotFoundError for an unknown line, ConflictError for an open week or a line already
	 * paid, ValidationError for a line with nothing to pay.
	 */
	pay(input: PayrollPayInput): void {
		this.audited({ action: 'payroll.pay', entity: 'payroll_lines' }, (tx) => {
			const { line, period } = this.requireLine(input.lineId, tx);
			if (period.status === 'open') throw new ConflictError('Сначала закройте неделю');
			if (line.paidAt !== null) throw new ConflictError('Выплата уже отмечена');
			if (line.payoutMinor <= 0) throw new ValidationError('По строке нечего выплачивать');
			const paidAt = this.calendar.moment();
			this.periods.updateLine(line.id, { paidAt, paidComment: input.comment }, tx);
			const unpaid = this.periods
				.lines(period.id, tx)
				.some((row) => row.payoutMinor > 0 && row.paidAt === null);
			if (!unpaid) this.periods.setStatus(period.id, { status: 'paid' }, tx);
			return {
				result: undefined,
				entityId: line.id,
				after: { staffId: line.staffId, payoutMinor: line.payoutMinor, comment: input.comment }
			};
		});
	}

	/** @throws NotFoundError for an unknown line, ConflictError for a line that is not paid. */
	unpay(lineId: number): void {
		this.audited({ action: 'payroll.unpay', entity: 'payroll_lines' }, (tx) => {
			const { line, period } = this.requireLine(lineId, tx);
			if (line.paidAt === null) throw new ConflictError('Выплата не отмечена');
			this.periods.updateLine(line.id, { paidAt: null, paidComment: null }, tx);
			if (period.status === 'paid') this.periods.setStatus(period.id, { status: 'calculated' }, tx);
			return {
				result: undefined,
				entityId: line.id,
				before: { paidAt: line.paidAt.toISOString() },
				after: { staffId: line.staffId, paidAt: null }
			};
		});
	}

	private requirePeriod(id: number, tx: Tx): PeriodRow {
		const period = this.periods.find(id, tx);
		if (!period) throw new NotFoundError('payroll period');
		return period;
	}

	private requireLine(id: number, tx: Tx): { line: LineRow; period: PeriodRow } {
		const line = this.periods.findLine(id, tx);
		if (!line) throw new NotFoundError('payroll line');
		return { line, period: this.requirePeriod(line.periodId, tx) };
	}
}
