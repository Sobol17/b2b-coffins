import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { workDayStaff, workDays, workEntries, workTypes } from '../db/schema';
import { WorkEntryCrewRepository } from './work-entry-crew.repository';
import type { WorkDayWithStaff, WorkTotalRow } from './work-day.repository';

const DAY = { id: workDays.id, workDate: workDays.workDate, totalMinor: workDays.totalMinor };

/** Day snapshots used by weekly payroll and reports; optional staff fence applies in SQL. */
export class WorkDayReportRepository extends BaseRepository<typeof workDays> {
	constructor(private readonly crews = new WorkEntryCrewRepository()) {
		super(workDays);
	}

	/** Days of the range, both ends included, oldest first. */
	between(from: Date, to: Date, tx?: Tx, ownStaffId?: number): WorkDayWithStaff[] {
		const days = this.dayRows(from, to, tx, ownStaffId);
		if (days.length === 0) return [];
		const people = this.peopleOf(
			days.map((day) => day.id),
			tx,
			ownStaffId
		);
		const entries = this.entriesOf(
			days.map((day) => day.id),
			tx,
			ownStaffId
		);
		const crews = this.crews.crewsOf(
			entries.map((entry) => entry.id),
			tx
		);
		return days.map((day) => ({
			...day,
			staffIds: people.filter((row) => row.dayId === day.id).map((row) => row.staffId),
			entries: entries
				.filter((entry) => entry.dayId === day.id)
				.map((entry) => ({ amountMinor: entry.amountMinor, staffIds: crews.get(entry.id) ?? [] }))
		}));
	}

	private dayRows(from: Date, to: Date, tx?: Tx, ownStaffId?: number) {
		return this.db(tx)
			.select({
				...DAY,
				totalMinor: ownStaffId === undefined ? workDays.totalMinor : sql<number>`0`
			})
			.from(workDays)
			.where(
				and(
					gte(workDays.workDate, from),
					lte(workDays.workDate, to),
					ownStaffId === undefined
						? undefined
						: sql`exists (select 1 from work_day_staff own where own.work_day_id = ${workDays.id} and own.staff_id = ${ownStaffId})`
				)
			)
			.orderBy(asc(workDays.workDate))
			.all();
	}

	private peopleOf(dayIds: readonly number[], tx?: Tx, ownStaffId?: number) {
		return this.db(tx)
			.select({ dayId: workDayStaff.workDayId, staffId: workDayStaff.staffId })
			.from(workDayStaff)
			.where(
				and(
					ownStaffId === undefined ? undefined : eq(workDayStaff.staffId, ownStaffId),
					inArray(workDayStaff.workDayId, [...dayIds])
				)
			)
			.all();
	}

	private entriesOf(dayIds: readonly number[], tx?: Tx, ownStaffId?: number) {
		return this.db(tx)
			.select({
				id: workEntries.id,
				dayId: workEntries.workDayId,
				amountMinor: workEntries.amountMinor
			})
			.from(workEntries)
			.where(
				and(
					ownStaffId === undefined
						? undefined
						: sql`exists (select 1 from work_entry_staff own where own.work_entry_id = ${workEntries.id} and own.staff_id = ${ownStaffId})`,
					inArray(workEntries.workDayId, [...dayIds])
				)
			)
			.all();
	}

	/** Quantity and sum per work over the range, both ends included. */
	worksBetween(from: Date, to: Date, tx?: Tx): WorkTotalRow[] {
		return this.db(tx)
			.select({
				workTypeId: workEntries.workTypeId,
				title: workTypes.title,
				qty: sql<number>`sum(${workEntries.qty})`,
				amountMinor: sql<number>`sum(${workEntries.amountMinor})`
			})
			.from(workEntries)
			.innerJoin(workDays, eq(workDays.id, workEntries.workDayId))
			.innerJoin(workTypes, eq(workTypes.id, workEntries.workTypeId))
			.where(and(gte(workDays.workDate, from), lte(workDays.workDate, to)))
			.groupBy(workEntries.workTypeId, workTypes.title)
			.orderBy(asc(workTypes.title))
			.all();
	}
}
