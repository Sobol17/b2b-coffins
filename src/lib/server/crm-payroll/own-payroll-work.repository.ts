import { and, asc, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import {
	shopUnits,
	shopUnitWorks,
	workDayStaff,
	workDays,
	workEntries,
	workEntryStaff
} from '../db/schema';

/** The personal journal keeps its actor fence in SQL, including frozen carpenter membership. */
export class OwnPayrollWorkRepository extends BaseRepository<typeof shopUnitWorks> {
	constructor() {
		super(shopUnitWorks);
	}

	between(from: Date, to: Date, ownStaffId: number, tx?: Tx) {
		const pendingCrew = sql`select 1 from ${workDayStaff} inner join ${workDays} on ${workDays.id} = ${workDayStaff.workDayId} where ${workDays.workDate} = ${shopUnitWorks.workDate} and ${workDayStaff.staffId} = ${ownStaffId} and ${workDayStaff.isCarpenter} = 1`;
		const frozenCrew = sql`select 1 from ${workEntryStaff} where ${workEntryStaff.workEntryId} = ${workEntries.id} and ${workEntryStaff.staffId} = ${ownStaffId}`;
		return this.db(tx)
			.select({
				unitId: shopUnitWorks.unitId,
				productTitle: shopUnits.productTitle,
				station: shopUnitWorks.station,
				workDate: shopUnitWorks.workDate,
				completedAt: shopUnitWorks.completedAt,
				confirmedAt: shopUnitWorks.confirmedAt,
				amountMinor: sql<number>`case when ${shopUnitWorks.confirmedAt} is null then ${shopUnitWorks.rateMinor} else coalesce(${workEntries.amountMinor}, 0) end`,
				crewCount: sql<number>`case when ${shopUnitWorks.confirmedAt} is not null then (select count(*) from ${workEntryStaff} where ${workEntryStaff.workEntryId} = ${workEntries.id}) when ${shopUnitWorks.station} = 'carpenter' then (select count(*) from ${workDayStaff} inner join ${workDays} on ${workDays.id} = ${workDayStaff.workDayId} where ${workDays.workDate} = ${shopUnitWorks.workDate} and ${workDayStaff.isCarpenter} = 1) else 1 end`,
				ownShare: sql<number>`case when ${shopUnitWorks.confirmedAt} is not null then exists (${frozenCrew}) when ${shopUnitWorks.station} = 'carpenter' then exists (${pendingCrew}) else ${shopUnitWorks.staffId} = ${ownStaffId} end`
			})
			.from(shopUnitWorks)
			.innerJoin(shopUnits, eq(shopUnits.id, shopUnitWorks.unitId))
			.leftJoin(workEntries, eq(workEntries.shopUnitWorkId, shopUnitWorks.id))
			.where(
				and(
					isNotNull(shopUnitWorks.completedAt),
					gte(shopUnitWorks.workDate, from),
					lte(shopUnitWorks.workDate, to),
					sql`(${shopUnitWorks.staffId} = ${ownStaffId} or (${shopUnitWorks.station} = 'carpenter' and ((${shopUnitWorks.confirmedAt} is null and exists (${pendingCrew})) or (${shopUnitWorks.confirmedAt} is not null and exists (${frozenCrew})))))`
				)
			)
			.orderBy(asc(shopUnitWorks.workDate), asc(shopUnitWorks.completedAt), asc(shopUnitWorks.id))
			.all();
	}
}
