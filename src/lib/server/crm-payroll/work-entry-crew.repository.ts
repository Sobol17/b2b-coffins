import { asc, eq, inArray, notExists } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { workDayStaff, workEntries, workEntryStaff } from '../db/schema';

/** Who did each work entry (tech.md v1.55): the entry's amount is split among them only. */
export class WorkEntryCrewRepository extends BaseRepository<typeof workEntryStaff> {
	constructor() {
		super(workEntryStaff);
	}

	/** Crew per entry, people in the order they were written. */
	crewsOf(entryIds: readonly number[], tx?: Tx): Map<number, number[]> {
		const crews = new Map<number, number[]>();
		if (entryIds.length === 0) return crews;
		const rows = this.db(tx)
			.select({ entryId: workEntryStaff.workEntryId, staffId: workEntryStaff.staffId })
			.from(workEntryStaff)
			.where(inArray(workEntryStaff.workEntryId, entryIds))
			.orderBy(asc(workEntryStaff.id))
			.all();
		for (const row of rows)
			crews.set(row.entryId, [...(crews.get(row.entryId) ?? []), row.staffId]);
		return crews;
	}

	insert(entryId: number, staffIds: readonly number[], tx?: Tx): void {
		if (staffIds.length === 0) return;
		this.db(tx)
			.insert(workEntryStaff)
			.values(staffIds.map((staffId) => ({ workEntryId: entryId, staffId })))
			.run();
	}

	/**
	 * Gives every entry without a crew the people of its day. The v1.48 rule split the day among
	 * all of them, so old days keep their pay. Entries with a crew are left alone, which makes a
	 * second run change nothing. Returns how many entries got a crew.
	 */
	backfill(tx?: Tx): number {
		const orphans = this.db(tx)
			.select({ id: workEntries.id, dayId: workEntries.workDayId })
			.from(workEntries)
			.where(
				notExists(
					this.db(tx)
						.select({ id: workEntryStaff.id })
						.from(workEntryStaff)
						.where(eq(workEntryStaff.workEntryId, workEntries.id))
				)
			)
			.all();
		let filled = 0;
		for (const entry of orphans) {
			const people = this.db(tx)
				.select({ staffId: workDayStaff.staffId })
				.from(workDayStaff)
				.where(eq(workDayStaff.workDayId, entry.dayId))
				.all();
			if (people.length === 0) continue;
			this.insert(
				entry.id,
				people.map((row) => row.staffId),
				tx
			);
			filled += 1;
		}
		return filled;
	}
}
