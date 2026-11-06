import { PolicyService } from '../auth/policy';
import { BaseService } from '../core/service';
import { ShopUnitWorkRepository } from '../crm-shop/shop-unit-work.repository';
import { PayrollCalendar } from './payroll-calendar';
import { PayrollStaffRepository } from './payroll-staff.repository';
import { PayrollWeekReader } from './payroll-week.reader';
import { WorkDayRepository } from './work-day.repository';
import { dayShares } from '$lib/domain/payroll/calc';
import type { ActorContext } from '$lib/types/actor';
import type { OwnPayrollDto } from '$lib/types/crm-payroll';

/** Own payroll has a separate server projection; the actor never chooses a staff id. */
export class OwnPayrollService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly calendar = new PayrollCalendar(),
		private readonly people = new PayrollStaffRepository(),
		private readonly days = new WorkDayRepository(),
		private readonly works = new ShopUnitWorkRepository()
	) {
		super(ctx);
		this.assert(
			ctx.scope === 'crm' && PolicyService.can(ctx, 'payroll.self.read'),
			'payroll.self.read'
		);
	}

	today(): string {
		return this.calendar.today();
	}

	week(date: string): OwnPayrollDto {
		this.calendar.instantOf(date);
		const startsOn = this.calendar.weekStartOf(date);
		const endsOn = this.calendar.weekEndOf(startsOn);
		const person = this.people.forUser(this.ctx.userId);
		if (!person)
			return {
				week: { startsOn, endsOn, status: 'open' },
				line: null,
				pendingMinor: 0,
				pending: []
			};
		const week = new PayrollWeekReader(this.calendar).read(date, undefined, person.id);
		const pending = this.works.pending(
			this.calendar.instantOf(startsOn),
			this.calendar.instantOf(endsOn),
			undefined,
			person.id
		);
		const entries = pending.map((row) => {
			const day = this.days.findByDate(row.work.workDate!);
			const crew =
				row.work.station === 'carpenter'
					? day
						? this.days.carpenterIdsOf(day.id)
						: []
					: [person.id];
			return {
				row,
				date: row.work.workDate!.getTime(),
				amountMinor: row.work.rateMinor,
				staffIds: crew
			};
		});
		const dates = [...new Set(entries.map((row) => row.date))];
		const pendingMinor = dates.reduce(
			(sum, at) =>
				sum +
				(dayShares(
					[person.id],
					entries.filter((row) => row.date === at)
				)[0]?.shareMinor ?? 0),
			0
		);
		return {
			week: { startsOn, endsOn, status: week.period?.status ?? 'open' },
			line: week.lines[0] ?? null,
			pendingMinor,
			pending: entries.map(({ row, staffIds }) => ({
				unitId: row.work.unitId,
				productTitle: row.productTitle,
				station: row.work.station,
				completedAt: row.work.completedAt!.toISOString(),
				shareMinor: Math.floor(row.work.rateMinor / staffIds.length / 100) * 100
			}))
		};
	}
}
