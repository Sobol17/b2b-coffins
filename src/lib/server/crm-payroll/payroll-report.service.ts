import { ValidationError } from '../core/errors';
import { PayrollBaseService } from './payroll-base.service';
import { PayrollCalendar } from './payroll-calendar';
import { PayrollStaffRepository } from './payroll-staff.repository';
import { WorkDayRepository } from './work-day.repository';
import { addDays, weekAccruals } from '$lib/domain/payroll/calc';
import type { ActorContext } from '$lib/types/actor';
import { PAYROLL_REPORT_MAX_DAYS, type PayrollReportDto } from '$lib/types/crm-payroll';
import type { PayrollReportInput } from '$lib/validation/crm-payroll';

/**
 * Earnings by worker and output by work over any dates (tech.md v1.48). It reads the days as they
 * stand, closed week or not; adjustments belong to a week's sheet and are not in it.
 */
export class PayrollReportService extends PayrollBaseService {
	constructor(
		ctx: ActorContext,
		private readonly calendar: PayrollCalendar = new PayrollCalendar(),
		private readonly days: WorkDayRepository = new WorkDayRepository(),
		private readonly staff: PayrollStaffRepository = new PayrollStaffRepository()
	) {
		super(ctx);
	}

	/** The current payroll week up to today: what the screen opens with. */
	defaultRange(): PayrollReportInput {
		const today = this.calendar.today();
		return { from: this.calendar.weekStartOf(today), to: today };
	}

	/** @throws ValidationError for a reversed range or one longer than a year. */
	report(input: PayrollReportInput): PayrollReportDto {
		if (input.from > input.to) {
			throw new ValidationError('Начало периода позже конца', { field: 'from' });
		}
		if (addDays(input.from, PAYROLL_REPORT_MAX_DAYS) <= input.to) {
			throw new ValidationError('Период не длиннее года', { field: 'to' });
		}
		const from = this.calendar.instantOf(input.from);
		const to = this.calendar.instantOf(input.to);
		const accruals = weekAccruals(this.days.between(from, to));
		const names = new Map(
			this.staff.byIds(accruals.map((line) => line.staffId)).map((row) => [row.id, row.fullName])
		);
		const staff = accruals
			.map((line) => ({ ...line, fullName: names.get(line.staffId) ?? '' }))
			.sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'));
		const works = this.days.worksBetween(from, to);
		return {
			from: input.from,
			to: input.to,
			staff,
			works,
			worksTotalMinor: works.reduce((sum, row) => sum + row.amountMinor, 0),
			accruedTotalMinor: staff.reduce((sum, row) => sum + row.accruedMinor, 0)
		};
	}
}
