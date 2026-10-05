import { and, asc, desc, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { workDayStaff, workDays, workEntries, workTypes } from '../db/schema';
import type { WorkEntryDto } from '$lib/types/crm-payroll';

export interface WorkDayRow {
	readonly id: number;
	readonly workDate: Date;
	readonly totalMinor: number;
	readonly shareMinor: number;
}

export interface WorkDayWithStaff extends WorkDayRow {
	readonly staffIds: number[];
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
	totalMinor: workDays.totalMinor,
	shareMinor: workDays.shareMinor
};

/** A work day with its people and its works (tech.md v1.48): one row per calendar date. */
export class WorkDayRepository extends BaseRepository<typeof workDays> {
	constructor() {
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

	entriesOf(dayId: number, tx?: Tx): WorkEntryDto[] {
		return this.db(tx)
			.select({
				workTypeId: workEntries.workTypeId,
				title: workTypes.title,
				qty: workEntries.qty,
				rateMinor: workEntries.rateMinor,
				amountMinor: workEntries.amountMinor
			})
			.from(workEntries)
			.innerJoin(workTypes, eq(workTypes.id, workEntries.workTypeId))
			.where(eq(workEntries.workDayId, dayId))
			.orderBy(asc(workTypes.title), asc(workEntries.id))
			.all();
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

	save(
		day: { workDate: Date; totalMinor: number; shareMinor: number; createdById: number },
		tx: Tx
	): number {
		const [saved] = this.db(tx)
			.insert(workDays)
			.values(day)
			.onConflictDoUpdate({
				target: workDays.workDate,
				// The upsert bypasses `$onUpdate`, so the stamp is written by hand.
				set: { totalMinor: day.totalMinor, shareMinor: day.shareMinor, updatedAt: new Date() }
			})
			.returning({ id: workDays.id })
			.all();
		if (!saved) throw new Error('failed to save a work day');
		return saved.id;
	}

	replaceStaff(dayId: number, staffIds: readonly number[], tx: Tx): void {
		this.db(tx).delete(workDayStaff).where(eq(workDayStaff.workDayId, dayId)).run();
		if (staffIds.length === 0) return;
		this.db(tx)
			.insert(workDayStaff)
			.values(staffIds.map((staffId) => ({ workDayId: dayId, staffId })))
			.run();
	}

	replaceEntries(
		dayId: number,
		entries: readonly { workTypeId: number; qty: number; rateMinor: number; amountMinor: number }[],
		tx: Tx
	): void {
		this.db(tx).delete(workEntries).where(eq(workEntries.workDayId, dayId)).run();
		if (entries.length === 0) return;
		this.db(tx)
			.insert(workEntries)
			.values(entries.map((entry) => ({ ...entry, workDayId: dayId })))
			.run();
	}

	/** The people and the works go with the day: both reference it with a cascade. */
	delete(dayId: number, tx: Tx): void {
		this.db(tx).delete(workDays).where(eq(workDays.id, dayId)).run();
	}

	/** Days of the range, both ends included, oldest first. */
	between(from: Date, to: Date, tx?: Tx): WorkDayWithStaff[] {
		const days = this.db(tx)
			.select(DAY)
			.from(workDays)
			.where(and(gte(workDays.workDate, from), lte(workDays.workDate, to)))
			.orderBy(asc(workDays.workDate))
			.all();
		if (days.length === 0) return [];
		const people = this.db(tx)
			.select({ dayId: workDayStaff.workDayId, staffId: workDayStaff.staffId })
			.from(workDayStaff)
			.where(
				inArray(
					workDayStaff.workDayId,
					days.map((day) => day.id)
				)
			)
			.all();
		return days.map((day) => ({
			...day,
			staffIds: people.filter((row) => row.dayId === day.id).map((row) => row.staffId)
		}));
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
