import { asc, eq, inArray } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { shopUnits, shopUnitWorks, staff } from '../db/schema';
import type { ShopUnitHistoryDto } from '$lib/types/crm-shop';
import { WORK_ROLES } from '$lib/types/roles';

type UnitHistory = { id: number; works: Array<ShopUnitHistoryDto['works'][number]> };

/** Executor history for the CRM card's already-authorized request lines. */
export class ShopUnitHistoryRepository extends BaseRepository<typeof shopUnits> {
	constructor() {
		super(shopUnits);
	}

	byItems(itemIds: readonly number[], tx?: Tx): Map<number, ShopUnitHistoryDto[]> {
		const byItem = new Map<number, ShopUnitHistoryDto[]>();
		if (itemIds.length === 0) return byItem;
		const rows = this.db(tx)
			.select({
				id: shopUnits.id,
				itemId: shopUnits.requestItemId,
				station: shopUnitWorks.station,
				fullName: staff.fullName,
				takenAt: shopUnitWorks.takenAt,
				completedAt: shopUnitWorks.completedAt
			})
			.from(shopUnits)
			.innerJoin(shopUnitWorks, eq(shopUnitWorks.unitId, shopUnits.id))
			.innerJoin(staff, eq(staff.id, shopUnitWorks.staffId))
			.where(inArray(shopUnits.requestItemId, [...itemIds]))
			.orderBy(asc(shopUnits.id))
			.all();
		const byUnit = new Map<number, UnitHistory>();
		for (const row of rows) {
			if (row.itemId === null) continue;
			let unit = byUnit.get(row.id);
			if (!unit) {
				unit = { id: row.id, works: [] };
				byUnit.set(row.id, unit);
				byItem.set(row.itemId, [...(byItem.get(row.itemId) ?? []), unit]);
			}
			unit.works.push({
				station: row.station,
				fullName: row.fullName,
				takenAt: row.takenAt.toISOString(),
				completedAt: row.completedAt?.toISOString() ?? null
			});
		}
		for (const unit of byUnit.values()) {
			unit.works.sort((a, b) => WORK_ROLES.indexOf(a.station) - WORK_ROLES.indexOf(b.station));
		}
		return byItem;
	}
}
