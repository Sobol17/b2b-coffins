import { eq, sql } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import {
	dictItems,
	payrollPeriods,
	roles,
	stockItems,
	stockMoves,
	userRoles,
	users
} from '../db/schema';
import type { RoleCode, Scope } from '$lib/types/roles';

export interface RecipientFacts {
	readonly scope: Scope;
	readonly roles: RoleCode[];
}

export interface StockItemFacts {
	readonly title: string;
	readonly code: string;
	readonly balance: number;
	readonly minThreshold: number;
	readonly unit: string;
}

export interface WeekFacts {
	readonly startsOn: Date;
	readonly endsOn: Date;
}

/** What a push text and its link are made of besides the request: read at send time (tech.md 7.1). */
export class PushFactsRepository extends BaseRepository<typeof users> {
	constructor() {
		super(users);
	}

	recipient(userId: number, tx?: Tx): RecipientFacts | undefined {
		const rows = this.db(tx)
			.select({ scope: users.scope, role: roles.code })
			.from(users)
			.innerJoin(userRoles, eq(userRoles.userId, users.id))
			.innerJoin(roles, eq(roles.id, userRoles.roleId))
			.where(eq(users.id, userId))
			.all();
		const [first] = rows;
		return first ? { scope: first.scope, roles: rows.map((row) => row.role) } : undefined;
	}

	/** The item as a whole, all colours together, the way the threshold watches it (v1.45). */
	stockItem(id: number, tx?: Tx): StockItemFacts | undefined {
		const [row] = this.db(tx)
			.select({
				title: stockItems.title,
				code: stockItems.code,
				minThreshold: stockItems.minThreshold,
				unit: dictItems.title,
				balance: sql<number>`coalesce(sum(${stockMoves.qty}), 0)`
			})
			.from(stockItems)
			.innerJoin(dictItems, eq(dictItems.id, stockItems.unitId))
			.leftJoin(stockMoves, eq(stockMoves.stockItemId, stockItems.id))
			.where(eq(stockItems.id, id))
			.groupBy(stockItems.id)
			.all();
		return row;
	}

	week(id: number, tx?: Tx): WeekFacts | undefined {
		const [row] = this.db(tx)
			.select({ startsOn: payrollPeriods.startsOn, endsOn: payrollPeriods.endsOn })
			.from(payrollPeriods)
			.where(eq(payrollPeriods.id, id))
			.all();
		return row;
	}
}
