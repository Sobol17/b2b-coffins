import { and, asc, eq, gte, lte, ne } from 'drizzle-orm';
import { ConflictError } from '../core/errors';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { payrollAccruals, payrollPeriods, staffSalaryTerms } from '../db/schema';
import { PayrollCalendar } from './payroll-calendar';
import type { StaffRow } from './payroll-staff.repository';
import { addDays } from '$lib/domain/payroll/calc';

/** Frozen piece earnings and dated monthly salary terms. */
export class CompensationRepository extends BaseRepository<typeof payrollAccruals> {
	constructor(private readonly calendar = new PayrollCalendar()) {
		super(payrollAccruals);
	}

	record(input: typeof payrollAccruals.$inferInsert, tx: Tx): void {
		this.db(tx).insert(payrollAccruals).values(input).onConflictDoNothing().run();
	}

	salaryTerm(person: StaffRow, first: boolean, tx: Tx): void {
		const effectiveOn = first ? this.calendar.today() : addDays(this.calendar.today(), 1);
		const amountMinor =
			person.isActive && person.payRole === 'laborer' ? person.monthlySalaryMinor : 0;
		const closed = this.db(tx)
			.select()
			.from(payrollPeriods)
			.where(
				and(
					ne(payrollPeriods.status, 'open'),
					gte(payrollPeriods.endsOn, this.calendar.instantOf(effectiveOn))
				)
			)
			.all()
			.map((period) => {
				const from = this.calendar.dateOf(period.startsOn);
				const to = this.calendar.dateOf(period.endsOn);
				return {
					from,
					to,
					amount: this.salaries(from, to, tx, person.id, true).get(person.id) ?? 0
				};
			});
		this.db(tx)
			.insert(staffSalaryTerms)
			.values({ staffId: person.id, effectiveOn, amountMinor })
			.onConflictDoUpdate({
				target: [staffSalaryTerms.staffId, staffSalaryTerms.effectiveOn],
				set: { amountMinor }
			})
			.run();
		// The caller's audited transaction rolls back both staff and terms on refusal.
		if (
			closed.some(
				(period) =>
					(this.salaries(period.from, period.to, tx, person.id, true).get(person.id) ?? 0) !==
					period.amount
			)
		) {
			throw new ConflictError('Неделя закрыта. Откройте её, чтобы изменить начисление оклада');
		}
	}

	between(from: string, to: string, tx?: Tx, ownStaffId?: number): Map<number, number> {
		const sums = this.salaries(from, to, tx, ownStaffId);
		const rows = this.db(tx)
			.select()
			.from(payrollAccruals)
			.where(
				and(
					gte(payrollAccruals.workDate, this.calendar.instantOf(from)),
					lte(payrollAccruals.workDate, this.calendar.instantOf(to)),
					ownStaffId === undefined ? undefined : eq(payrollAccruals.staffId, ownStaffId)
				)
			)
			.all();
		for (const row of rows)
			sums.set(row.staffId, (sums.get(row.staffId) ?? 0) + row.qty * row.rateMinor);
		return sums;
	}

	salaries(
		from: string,
		to: string,
		tx?: Tx,
		ownStaffId?: number,
		includeFuture = false
	): Map<number, number> {
		const sums = new Map<number, number>();
		const end = includeFuture ? to : [to, this.calendar.today()].sort()[0]!;
		if (from > end) return sums;
		const terms = this.db(tx)
			.select()
			.from(staffSalaryTerms)
			.where(
				and(
					lte(staffSalaryTerms.effectiveOn, end),
					ownStaffId === undefined ? undefined : eq(staffSalaryTerms.staffId, ownStaffId)
				)
			)
			.orderBy(asc(staffSalaryTerms.effectiveOn), asc(staffSalaryTerms.id))
			.all();
		for (let month = from.slice(0, 7); month <= end.slice(0, 7); month = this.nextMonth(month)) {
			const date = month + '-27';
			if (date < from || date > end) continue;
			const current = new Map<number, number>();
			for (const term of terms) {
				if (term.effectiveOn > date) break;
				current.set(term.staffId, term.amountMinor);
			}
			for (const [id, amount] of current)
				if (amount > 0) sums.set(id, (sums.get(id) ?? 0) + amount);
		}
		return sums;
	}

	private nextMonth(month: string): string {
		const year = Number(month.slice(0, 4)),
			number = Number(month.slice(5));
		return number === 12
			? String(year + 1) + '-01'
			: String(year) + '-' + String(number + 1).padStart(2, '0');
	}
}
