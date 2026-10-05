import { ValidationError } from '../core/errors';
import type { Tx } from '../db/client';
import { PayrollBaseService } from './payroll-base.service';
import { PayrollCalendar } from './payroll-calendar';
import { PayrollPeriodGate } from './payroll-period-gate';
import { PayrollStaffRepository } from './payroll-staff.repository';
import { WorkDayRepository } from './work-day.repository';
import { WorkTypeRepository } from './work-type.repository';
import { dayShareMinor, dayTotalMinor } from '$lib/domain/payroll/calc';
import type { ActorContext } from '$lib/types/actor';
import type { WorkDayDto } from '$lib/types/crm-payroll';
import type { WorkDaySaveInput } from '$lib/validation/crm-payroll';

/**
 * One work day of the crew (tech.md v1.48): who worked, what was done, and the day's sum split
 * equally among those people.
 */
export class WorkDayService extends PayrollBaseService {
	constructor(
		ctx: ActorContext,
		private readonly calendar: PayrollCalendar = new PayrollCalendar(),
		private readonly days: WorkDayRepository = new WorkDayRepository(),
		private readonly staff: PayrollStaffRepository = new PayrollStaffRepository(),
		private readonly works: WorkTypeRepository = new WorkTypeRepository(),
		private readonly gate: PayrollPeriodGate = new PayrollPeriodGate(calendar)
	) {
		super(ctx);
	}

	/** @throws ValidationError for a text that is not a calendar date. */
	get(date: string): WorkDayDto {
		const instant = this.calendar.instantOf(date);
		const day = this.days.findByDate(instant);
		const staffIds = day ? this.days.staffIdsOf(day.id) : [];
		const entries = day ? this.days.entriesOf(day.id) : [];
		const used = new Set(entries.map((entry) => entry.workTypeId));
		const periodStatus = this.gate.find(date)?.status ?? 'open';
		const canEdit = this.canManage && periodStatus === 'open' && date <= this.calendar.today();
		return {
			date,
			weekStartsOn: this.calendar.weekStartOf(date),
			periodStatus,
			canEdit,
			canCopyPrevious:
				canEdit && staffIds.length === 0 && this.days.previousStaffIds(instant).length > 0,
			staff: this.staff
				.all()
				.filter((row) => row.isActive || staffIds.includes(row.id))
				.map((row) => ({
					id: row.id,
					fullName: row.fullName,
					position: row.position,
					present: staffIds.includes(row.id)
				})),
			workTypes: this.works.all().filter((row) => row.isActive || used.has(row.id)),
			entries,
			presentCount: staffIds.length,
			totalMinor: day?.totalMinor ?? 0,
			shareMinor: day?.shareMinor ?? 0
		};
	}

	/**
	 * Writes the whole day at once.
	 * @throws ValidationError for a future date, unknown or switched-off people and works, and
	 * works without anybody to split them; ConflictError when the week is closed.
	 */
	save(input: WorkDaySaveInput): WorkDayDto {
		this.assertManage();
		this.audited({ action: 'payroll.day.save', entity: 'work_days' }, (tx) =>
			this.write(input, tx)
		);
		return this.get(input.date);
	}

	/**
	 * Brings the people of the latest marked day into a day nobody is marked on yet.
	 * @throws ValidationError when the day already has people or there is nothing to copy.
	 */
	copyPrevious(date: string): WorkDayDto {
		this.assertManage();
		this.audited({ action: 'payroll.day.save', entity: 'work_days' }, (tx) => {
			const instant = this.calendar.instantOf(date);
			const day = this.days.findByDate(instant, tx);
			if (day && this.days.staffIdsOf(day.id, tx).length > 0) {
				throw new ValidationError('В этом дне уже отмечены сотрудники');
			}
			const previous = this.staff
				.byIds(this.days.previousStaffIds(instant, tx), tx)
				.filter((row) => row.isActive)
				.map((row) => row.id);
			if (previous.length === 0) throw new ValidationError('Нет прошлого дня, чтобы скопировать');
			const entries = day ? this.days.entriesOf(day.id, tx) : [];
			return this.write({ date, staffIds: previous, entries }, tx);
		});
		return this.get(date);
	}

	private write(input: WorkDaySaveInput, tx: Tx) {
		if (input.date > this.calendar.today()) {
			throw new ValidationError('Будущий день отметить нельзя', { field: 'date' });
		}
		const instant = this.calendar.instantOf(input.date);
		this.gate.requireOpen(input.date, tx);
		const day = this.days.findByDate(instant, tx);
		const after = { date: input.date, staffIds: input.staffIds, entries: input.entries };
		if (input.staffIds.length === 0 && input.entries.length === 0) {
			if (day) this.days.delete(day.id, tx);
			return { result: undefined, entityId: day?.id ?? null, after };
		}
		if (input.staffIds.length === 0) {
			throw new ValidationError('Отметьте, кто работал: сумму дня не на кого делить');
		}
		this.assertStaff(input.staffIds, day ? this.days.staffIdsOf(day.id, tx) : [], tx);
		const entries = this.priced(input.entries, day ? this.days.entriesOf(day.id, tx) : [], tx);
		const totalMinor = dayTotalMinor(entries);
		const shareMinor = dayShareMinor(totalMinor, input.staffIds.length);
		const dayId = this.days.save(
			{ workDate: instant, totalMinor, shareMinor, createdById: this.ctx.userId },
			tx
		);
		this.days.replaceStaff(dayId, input.staffIds, tx);
		this.days.replaceEntries(dayId, entries, tx);
		return { result: undefined, entityId: dayId, after: { ...after, totalMinor, shareMinor } };
	}

	/** A switched-off worker stays on a day they are already on, but cannot be added to one. */
	private assertStaff(staffIds: readonly number[], kept: readonly number[], tx: Tx): void {
		const rows = this.staff.byIds(staffIds, tx);
		const allowed = rows.filter((row) => row.isActive || kept.includes(row.id));
		if (allowed.length !== staffIds.length) {
			throw new ValidationError('Сотрудника нет в справочнике или он выключен', {
				field: 'staffIds'
			});
		}
	}

	/** An entry already on the day keeps its frozen price; a new one takes today's price. */
	private priced(
		input: WorkDaySaveInput['entries'],
		kept: readonly { workTypeId: number; rateMinor: number }[],
		tx: Tx
	) {
		const frozen = new Map(kept.map((entry) => [entry.workTypeId, entry.rateMinor]));
		const types = new Map(
			this.works
				.byIds(
					input.map((entry) => entry.workTypeId),
					tx
				)
				.map((row) => [row.id, row])
		);
		return input.map((entry) => {
			const type = types.get(entry.workTypeId);
			const rateMinor = frozen.get(entry.workTypeId) ?? (type?.isActive ? type.rateMinor : null);
			if (!type || rateMinor === null) {
				throw new ValidationError('Работы нет в списке или она выключена', { field: 'entries' });
			}
			return { ...entry, rateMinor, amountMinor: entry.qty * rateMinor };
		});
	}
}
