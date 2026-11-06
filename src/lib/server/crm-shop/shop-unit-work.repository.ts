import { and, eq, gte, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { shopUnits, shopUnitWorks, staff, workDayStaff, workDays, workTypes } from '../db/schema';
import type { WorkRole } from '$lib/types/roles';

export type UnitWorkRow = typeof shopUnitWorks.$inferSelect;

/** Frozen station work is the source for pending pay and a confirmed payroll entry. */
export class ShopUnitWorkRepository extends BaseRepository<typeof shopUnitWorks> {
	constructor() {
		super(shopUnitWorks);
	}

	find(unitId: number, station: WorkRole, tx?: Tx) {
		return this.db(tx)
			.select({ work: shopUnitWorks, userId: staff.userId })
			.from(shopUnitWorks)
			.innerJoin(staff, eq(staff.id, shopUnitWorks.staffId))
			.where(and(eq(shopUnitWorks.unitId, unitId), eq(shopUnitWorks.station, station)))
			.get();
	}

	claim(
		input: { unitId: number; station: WorkRole; taskId: number; staffId: number; takenAt: Date },
		tx: Tx
	): void {
		tx.insert(shopUnitWorks).values(input).onConflictDoNothing().run();
	}

	rate(variantId: number, station: WorkRole, tx: Tx) {
		return tx
			.select({ id: workTypes.id, rateMinor: workTypes.rateMinor })
			.from(workTypes)
			.where(
				and(
					eq(workTypes.variantId, variantId),
					eq(workTypes.roleCode, station),
					eq(workTypes.isActive, true)
				)
			)
			.get();
	}

	complete(
		id: number,
		rate: { id: number; rateMinor: number },
		at: Date,
		workDate: Date,
		tx: Tx
	): void {
		tx.update(shopUnitWorks)
			.set({ completedAt: at, workDate, workTypeId: rate.id, rateMinor: rate.rateMinor })
			.where(and(eq(shopUnitWorks.id, id), isNull(shopUnitWorks.completedAt)))
			.run();
	}

	pending(from: Date, to: Date, tx?: Tx, ownStaffId?: number) {
		const own =
			ownStaffId === undefined
				? undefined
				: sql`(${shopUnitWorks.staffId} = ${ownStaffId} or (${shopUnitWorks.station} = 'carpenter' and exists (select 1 from ${workDayStaff} inner join ${workDays} on ${workDays.id} = ${workDayStaff.workDayId} where ${workDays.workDate} = ${shopUnitWorks.workDate} and ${workDayStaff.staffId} = ${ownStaffId} and ${workDayStaff.isCarpenter} = 1)))`;
		return this.db(tx)
			.select({ work: shopUnitWorks, productTitle: shopUnits.productTitle })
			.from(shopUnitWorks)
			.innerJoin(shopUnits, eq(shopUnits.id, shopUnitWorks.unitId))
			.where(
				and(
					isNotNull(shopUnitWorks.completedAt),
					isNull(shopUnitWorks.confirmedAt),
					gte(shopUnitWorks.workDate, from),
					lte(shopUnitWorks.workDate, to),
					own
				)
			)
			.all();
	}

	confirm(id: number, actorId: number, at: Date, tx: Tx): void {
		tx.update(shopUnitWorks)
			.set({ confirmedAt: at, confirmedById: actorId })
			.where(and(eq(shopUnitWorks.id, id), isNull(shopUnitWorks.confirmedAt)))
			.run();
	}
}
