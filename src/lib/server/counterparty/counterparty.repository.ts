import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { countExpression } from '../core/list';
import { BaseRepository } from '../core/repository';
import { contracts, counterparties, requests, roles, userRoles, users } from '../db/schema';
import type { ActorContext } from '$lib/types/actor';
import type { RequestStatus } from '$lib/types/request';
import type { RoleCode } from '$lib/types/roles';

export interface CounterpartyRow {
	readonly id: number;
	readonly name: string;
	/** Not shown in the portal since v1.33; the draft calculator still prices with it. */
	readonly discountPercent: number;
	readonly staffLimit: number;
	readonly managerId: number | null;
}

export interface ContactRow {
	readonly fullName: string;
	readonly phone: string | null;
	readonly email: string;
}

export interface ContractRow {
	readonly number: string;
	readonly signedAt: Date | null;
	readonly validUntil: Date | null;
}

export interface MoneyTotalsRow {
	readonly debtMinor: number;
	readonly yearPurchasesMinor: number;
	readonly yearDeliveries: number;
}

// Debt is what was handed over and not yet paid; a purchase is anything handed over.
const OPEN_DEBT: RequestStatus[] = ['delivered', 'awaiting_payment'];
const PURCHASED: RequestStatus[] = ['delivered', 'awaiting_payment', 'paid'];

export class CounterpartyRepository extends BaseRepository<typeof counterparties> {
	constructor() {
		super(counterparties);
	}

	/** The actor's own counterparty. The row-level filter is the only way to address it. */
	findOwn(ctx: ActorContext): CounterpartyRow | undefined {
		const [row] = this.db()
			.select({
				id: counterparties.id,
				name: counterparties.name,
				discountPercent: counterparties.discountPercent,
				staffLimit: counterparties.staffLimit,
				managerId: counterparties.managerId
			})
			.from(counterparties)
			.where(
				this.scopedWhere(
					ctx,
					(counterpartyId) => eq(counterparties.id, counterpartyId),
					isNull(counterparties.deletedAt)
				)
			)
			.all();
		return row;
	}

	findContact(userId: number): ContactRow | undefined {
		const [row] = this.db()
			.select({ fullName: users.fullName, phone: users.phone, email: users.email })
			.from(users)
			.where(and(eq(users.id, userId), isNull(users.deletedAt)))
			.all();
		return row;
	}

	latestContract(counterpartyId: number): ContractRow | undefined {
		const [row] = this.db()
			.select({
				number: contracts.number,
				signedAt: contracts.signedAt,
				validUntil: contracts.validUntil
			})
			.from(contracts)
			.where(eq(contracts.counterpartyId, counterpartyId))
			.orderBy(desc(contracts.signedAt), desc(contracts.id))
			.limit(1)
			.all();
		return row;
	}

	activeStaff(
		counterpartyId: number,
		limit: number
	): { rows: (ContactRow & { role: RoleCode })[]; total: number } {
		const where = and(
			eq(users.counterpartyId, counterpartyId),
			eq(users.isActive, true),
			isNull(users.deletedAt)
		);
		const [counted] = this.db().select({ total: countExpression }).from(users).where(where).all();
		const rows = this.db()
			.select({
				fullName: users.fullName,
				phone: users.phone,
				email: users.email,
				role: roles.code
			})
			.from(users)
			.innerJoin(userRoles, eq(userRoles.userId, users.id))
			.innerJoin(roles, eq(roles.id, userRoles.roleId))
			.where(where)
			.orderBy(roles.code, users.fullName)
			.limit(limit)
			.all();
		return { rows, total: counted?.total ?? 0 };
	}

	/** Money figures of the card. Called only for a role that may see prices. */
	moneyTotals(counterpartyId: number, yearStart: Date): MoneyTotalsRow {
		const [debt] = this.db()
			.select({
				value: sql<number>`coalesce(sum(${requests.totalMinor} - ${requests.paidMinor}), 0)`
			})
			.from(requests)
			.where(and(eq(requests.counterpartyId, counterpartyId), inArray(requests.status, OPEN_DEBT)))
			.all();
		const [year] = this.db()
			.select({
				value: sql<number>`coalesce(sum(${requests.totalMinor}), 0)`,
				count: countExpression
			})
			.from(requests)
			.where(
				and(
					eq(requests.counterpartyId, counterpartyId),
					inArray(requests.status, PURCHASED),
					gte(requests.deliveredAt, yearStart)
				)
			)
			.all();
		return {
			debtMinor: debt?.value ?? 0,
			yearPurchasesMinor: year?.value ?? 0,
			yearDeliveries: year?.count ?? 0
		};
	}
}
