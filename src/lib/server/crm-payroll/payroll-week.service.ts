import { NotFoundError, ValidationError } from '../core/errors';
import { PayrollBaseService } from './payroll-base.service';
import { PayrollCalendar } from './payroll-calendar';
import { PayrollPeriodGate } from './payroll-period-gate';
import { PayrollPeriodRepository } from './payroll-period.repository';
import { PayrollWeekReader, type WeekSnapshot } from './payroll-week.reader';
import { payoutMinor } from '$lib/domain/payroll/calc';
import type { ActorContext } from '$lib/types/actor';
import type { PayrollWeekDto } from '$lib/types/crm-payroll';
import type { PayrollAdjustInput } from '$lib/validation/crm-payroll';

/** The weekly summary and its adjustments (tech.md v1.48). */
export class PayrollWeekService extends PayrollBaseService {
	constructor(
		ctx: ActorContext,
		private readonly calendar: PayrollCalendar = new PayrollCalendar(),
		private readonly periods: PayrollPeriodRepository = new PayrollPeriodRepository(),
		private readonly reader: PayrollWeekReader = new PayrollWeekReader(calendar, periods),
		private readonly gate: PayrollPeriodGate = new PayrollPeriodGate(calendar, periods)
	) {
		super(ctx);
	}

	today(): string {
		return this.calendar.today();
	}

	/** The week that holds the date. @throws ValidationError for a text that is not a date. */
	week(date: string): PayrollWeekDto {
		return this.toDto(this.reader.read(date));
	}

	/**
	 * Sets the signed correction of one worker's week; zero clears it.
	 * @throws ConflictError when the week is closed, ValidationError when the payout would go
	 * below zero, NotFoundError for a worker who is not on the sheet.
	 */
	adjust(input: PayrollAdjustInput): PayrollWeekDto {
		this.assertManage();
		const adjustmentMinor = input.direction === 'minus' ? -input.amountMinor : input.amountMinor;
		this.audited({ action: 'payroll.adjust', entity: 'payroll_periods' }, (tx) => {
			const periodId = this.gate.requireOpen(input.week, tx);
			const line = this.reader
				.read(input.week, tx)
				.lines.find((row) => row.staffId === input.staffId);
			if (!line) throw new NotFoundError('staff');
			if (payoutMinor(line.accruedMinor, adjustmentMinor) < 0) {
				throw new ValidationError('Удержание больше начисленного', { field: 'amountMinor' });
			}
			const adjustmentComment = adjustmentMinor === 0 ? null : input.comment;
			this.periods.upsertLine(periodId, input.staffId, { adjustmentMinor, adjustmentComment }, tx);
			return {
				result: undefined,
				entityId: periodId,
				before: { staffId: input.staffId, adjustmentMinor: line.adjustmentMinor },
				after: { staffId: input.staffId, adjustmentMinor, comment: adjustmentComment }
			};
		});
		return this.week(input.week);
	}

	private toDto(week: WeekSnapshot): PayrollWeekDto {
		return {
			periodId: week.period?.id ?? null,
			startsOn: week.startsOn,
			endsOn: week.endsOn,
			status: week.period?.status ?? 'open',
			closedAt: week.period?.closedAt?.toISOString() ?? null,
			closedByName: week.period?.closedByName ?? null,
			days: week.days,
			lines: week.lines,
			totalPayoutMinor: week.lines.reduce((sum, line) => sum + line.payoutMinor, 0),
			canManage: this.canManage
		};
	}
}
