import { PolicyService } from '../auth/policy';
import { BaseService } from '../core/service';
import { ShopUnitWorkRepository } from '../crm-shop/shop-unit-work.repository';
import { PayrollCalendar } from './payroll-calendar';
import { OwnPayrollWorkRepository } from './own-payroll-work.repository';
import { PayrollStaffRepository, type StaffRow } from './payroll-staff.repository';
import { PayrollWeekReader } from './payroll-week.reader';
import { WorkDayRepository } from './work-day.repository';
import { dayShares, type CrewEntry } from '$lib/domain/payroll/calc';
import { PAYROLL_SHARE_STEP_MINOR } from '$lib/types/crm-payroll';
import type { ActorContext } from '$lib/types/actor';
import type { OwnPayrollDto, OwnPayrollWorkDto, PayrollLineDto } from '$lib/types/crm-payroll';

type PendingRow = ReturnType<ShopUnitWorkRepository['pending']>[number];
interface PreviewEntry extends CrewEntry {
	row: PendingRow;
	date: number;
}

/** Own payroll has a separate server projection; the actor never chooses a staff id. */
export class OwnPayrollService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly calendar = new PayrollCalendar(),
		private readonly people = new PayrollStaffRepository(),
		private readonly days = new WorkDayRepository(),
		private readonly works = new ShopUnitWorkRepository(),
		private readonly journal = new OwnPayrollWorkRepository()
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
				pending: [],
				works: []
			};
		const week = new PayrollWeekReader(this.calendar).read(date, undefined, person.id);
		const entries = this.previews(person.id, startsOn, endsOn);
		const line = week.lines[0] ?? this.emptyLine(person);
		return {
			week: { startsOn, endsOn, status: week.period?.status ?? 'open' },
			line,
			works: this.workJournal(person.id, startsOn, endsOn, line.paidAt !== null),
			pendingMinor: this.pendingTotal(person.id, entries),
			pending: entries.map(({ row, staffIds }) => ({
				unitId: row.work.unitId,
				productTitle: row.productTitle,
				station: row.work.station,
				completedAt: row.work.completedAt!.toISOString(),
				shareMinor: staffIds.includes(person.id)
					? Math.floor(row.work.rateMinor / staffIds.length / PAYROLL_SHARE_STEP_MINOR) *
						PAYROLL_SHARE_STEP_MINOR
					: 0
			}))
		};
	}

	private workJournal(
		staffId: number,
		startsOn: string,
		endsOn: string,
		paid: boolean
	): OwnPayrollWorkDto[] {
		return this.journal
			.between(this.calendar.instantOf(startsOn), this.calendar.instantOf(endsOn), staffId)
			.map((row) => {
				const awaitingCrew =
					row.confirmedAt === null &&
					row.station === 'carpenter' &&
					row.crewCount === 0 &&
					row.amountMinor > 0;
				return {
					unitId: row.unitId,
					productTitle: row.productTitle,
					station: row.station,
					workDate: this.calendar.dateOf(row.workDate!),
					completedAt: row.completedAt!.toISOString(),
					shareMinor: awaitingCrew
						? null
						: row.ownShare && row.crewCount > 0
							? Math.floor(row.amountMinor / row.crewCount / PAYROLL_SHARE_STEP_MINOR) *
								PAYROLL_SHARE_STEP_MINOR
							: 0,
					status:
						row.confirmedAt !== null
							? paid
								? 'paid'
								: 'confirmed'
							: awaitingCrew
								? 'awaiting_crew'
								: 'awaiting_confirmation'
				};
			});
	}

	private emptyLine(person: StaffRow): PayrollLineDto {
		return {
			id: null,
			staffId: person.id,
			fullName: person.fullName,
			position: person.position,
			daysWorked: 0,
			accruedMinor: 0,
			adjustmentMinor: 0,
			adjustmentComment: null,
			payoutMinor: 0,
			paidAt: null,
			paidComment: null
		};
	}

	private previews(staffId: number, startsOn: string, endsOn: string): PreviewEntry[] {
		return this.works
			.pending(
				this.calendar.instantOf(startsOn),
				this.calendar.instantOf(endsOn),
				undefined,
				staffId
			)
			.map((row) => {
				const day = this.days.findByDate(row.work.workDate!);
				const crew =
					row.work.station === 'carpenter'
						? day
							? this.days.carpenterIdsOf(day.id)
							: []
						: [staffId];
				return {
					row,
					date: row.work.workDate!.getTime(),
					amountMinor: row.work.rateMinor,
					staffIds: crew
				};
			});
	}

	/** Pending pay is the day's rounded total after confirmation minus its current rounded pay. */
	private pendingTotal(staffId: number, entries: readonly PreviewEntry[]): number {
		return [...new Set(entries.map((row) => row.date))].reduce((sum, date) => {
			const at = new Date(date);
			const confirmed = this.days.between(at, at, undefined, staffId)[0]?.entries ?? [];
			const after = [...confirmed, ...entries.filter((row) => row.date === date)];
			const share = (rows: readonly CrewEntry[]) => dayShares([staffId], rows)[0]?.shareMinor ?? 0;
			return sum + share(after) - share(confirmed);
		}, 0);
	}
}
