import { and, asc, desc, eq, isNull, lt } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { shopUnitWorks, workDayStaff, workDays, workEntries, workTypes } from '../db/schema';
import { WorkEntryCrewRepository } from './work-entry-crew.repository';
import { WorkDayReportRepository } from './work-day-report.repository';
import type { CrewEntry } from '$lib/domain/payroll/calc';
import type { WorkEntryDto } from '$lib/types/crm-payroll';

export interface WorkDayRow {
	readonly id: number;
	readonly workDate: Date;
	readonly totalMinor: number;
}

export interface WorkDayWithStaff extends WorkDayRow {
	readonly staffIds: number[];
	readonly entries: CrewEntry[];
}

export interface EntryToSave {
	readonly workTypeId: number;
	readonly qty: number;
	readonly rateMinor: number;
	readonly amountMinor: number;
	readonly staffIds: readonly number[];
}

export interface WorkTotalRow {
	readonly workTypeId: number;
	readonly title: string;
	readonly qty: number;
	readonly amountMinor: number;
}

const DAY = {
	id: workDays.id,
	workDate: workDays.workDate,
	totalMinor: workDays.totalMinor
};

/**
 * A work day with its people and its works (tech.md v1.48), each work with its crew (v1.55): one
 * row per calendar date.
 */
export class WorkDayRepository extends BaseRepository<typeof workDays> {
	constructor(private readonly crews: WorkEntryCrewRepository = new WorkEntryCrewRepository()) {
		super(workDays);
	}

	findByDate(workDate: Date, tx?: Tx): WorkDayRow | undefined {
		const [row] = this.db(tx)
			.select(DAY)
			.from(workDays)
			.where(eq(workDays.workDate, workDate))
			.all();
		return row;
	}

	staffIdsOf(dayId: number, tx?: Tx): number[] {
		return this.db(tx)
			.select({ staffId: workDayStaff.staffId })
			.from(workDayStaff)
			.where(eq(workDayStaff.workDayId, dayId))
			.all()
			.map((row) => row.staffId);
	}

	carpenterIdsOf(dayId: number, tx?: Tx): number[] {
		return this.db(tx)
			.select({ id: workDayStaff.staffId })
			.from(workDayStaff)
			.where(and(eq(workDayStaff.workDayId, dayId), eq(workDayStaff.isCarpenter, true)))
			.all()
			.map((row) => row.id);
	}

	carpenterLocked(dayId: number, tx?: Tx): boolean {
		return (
			this.db(tx)
				.select({ id: workEntries.id })
				.from(workEntries)
				.innerJoin(shopUnitWorks, eq(shopUnitWorks.id, workEntries.shopUnitWorkId))
				.where(and(eq(workEntries.workDayId, dayId), eq(shopUnitWorks.station, 'carpenter')))
				.get() !== undefined
		);
	}

	entriesOf(dayId: number, tx?: Tx): WorkEntryDto[] {
		const rows = this.db(tx)
			.select({
				id: workEntries.id,
				workTypeId: workEntries.workTypeId,
				title: workTypes.title,
				qty: workEntries.qty,
				rateMinor: workEntries.rateMinor,
				amountMinor: workEntries.amountMinor,
				shopUnitWorkId: workEntries.shopUnitWorkId
			})
			.from(workEntries)
			.innerJoin(workTypes, eq(workTypes.id, workEntries.workTypeId))
			.where(eq(workEntries.workDayId, dayId))
			.orderBy(asc(workTypes.title), asc(workEntries.id))
			.all();
		const crews = this.crews.crewsOf(
			rows.map((row) => row.id),
			tx
		);
		return rows.map(({ id, shopUnitWorkId, ...row }) => ({
			...row,
			staffIds: crews.get(id) ?? [],
			...(shopUnitWorkId === null ? {} : { shopUnitWorkId })
		}));
	}

	/** People of the latest marked day before the date: what «Скопировать прошлый день» brings. */
	previousStaffIds(before: Date, tx?: Tx): number[] {
		const [previous] = this.db(tx)
			.select({ id: workDays.id })
			.from(workDays)
			.innerJoin(workDayStaff, eq(workDayStaff.workDayId, workDays.id))
			.where(lt(workDays.workDate, before))
			.orderBy(desc(workDays.workDate))
			.limit(1)
			.all();
		return previous ? this.staffIdsOf(previous.id, tx) : [];
	}

	save(day: { workDate: Date; totalMinor: number; createdById: number }, tx: Tx): number {
		const [saved] = this.db(tx)
			.insert(workDays)
			.values(day)
			.onConflictDoUpdate({
				target: workDays.workDate,
				// The upsert bypasses `$onUpdate`, so the stamp is written by hand.
				set: { totalMinor: day.totalMinor, updatedAt: new Date() }
			})
			.returning({ id: workDays.id })
			.all();
		if (!saved) throw new Error('failed to save a work day');
		return saved.id;
	}

	replaceStaff(
		dayId: number,
		staffIds: readonly number[],
		tx: Tx,
		carpenterIds: readonly number[] = []
	): void {
		this.db(tx).delete(workDayStaff).where(eq(workDayStaff.workDayId, dayId)).run();
		if (staffIds.length === 0) return;
		this.db(tx)
			.insert(workDayStaff)
			.values(
				staffIds.map((staffId) => ({
					workDayId: dayId,
					staffId,
					isCarpenter: carpenterIds.includes(staffId)
				}))
			)
			.run();
	}

	/** The crews go with their entries: they reference them with a cascade. */
	replaceEntries(dayId: number, entries: readonly EntryToSave[], tx: Tx): void {
		this.db(tx)
			.delete(workEntries)
			.where(and(eq(workEntries.workDayId, dayId), isNull(workEntries.shopUnitWorkId)))
			.run();
		for (const { staffIds, ...entry } of entries) {
			const [saved] = this.db(tx)
				.insert(workEntries)
				.values({ ...entry, workDayId: dayId })
				.returning({ id: workEntries.id })
				.all();
			if (!saved) throw new Error('failed to save a work entry');
			this.crews.insert(saved.id, staffIds, tx);
		}
	}

	insertAutomatic(
		dayId: number,
		sourceId: number,
		workTypeId: number,
		rateMinor: number,
		crew: readonly number[],
		tx: Tx
	): void {
		const saved = tx
			.insert(workEntries)
			.values({
				workDayId: dayId,
				shopUnitWorkId: sourceId,
				workTypeId,
				qty: 1,
				rateMinor,
				amountMinor: rateMinor
			})
			.returning({ id: workEntries.id })
			.get();
		if (!saved) throw new Error('automatic work entry insert returned nothing');
		this.crews.insert(saved.id, crew, tx);
	}

	/** The people and the works go with the day: both reference it with a cascade. */
	delete(dayId: number, tx: Tx): void {
		this.db(tx).delete(workDays).where(eq(workDays.id, dayId)).run();
	}

	between(from: Date, to: Date, tx?: Tx, ownStaffId?: number): WorkDayWithStaff[] {
		return new WorkDayReportRepository(this.crews).between(from, to, tx, ownStaffId);
	}

	worksBetween(from: Date, to: Date, tx?: Tx): WorkTotalRow[] {
		return new WorkDayReportRepository(this.crews).worksBetween(from, to, tx);
	}
}
