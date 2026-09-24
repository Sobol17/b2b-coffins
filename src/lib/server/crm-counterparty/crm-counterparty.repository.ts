import { and, asc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { countExpression, offsetFor, orderByFor } from '../core/list';
import { BaseRepository } from '../core/repository';
import { containsText } from '../core/search';
import type { Tx } from '../db/client';
import { counterparties, priceLists, roles, userRoles, users } from '../db/schema';
import type { SettlementScheme } from '$lib/types/counterparty';
import type {
	CrmCounterpartyChoicesDto,
	CrmCounterpartyFilters
} from '$lib/types/crm-counterparty';
import type { ListQuery } from '$lib/types/list';
import type { RequisitesInput, TermsInput } from '$lib/validation/crm-counterparty';

export interface CounterpartyListRow {
	readonly id: number;
	readonly name: string;
	readonly inn: string | null;
	readonly managerName: string | null;
	readonly settlementScheme: SettlementScheme;
	readonly staffCount: number;
	readonly isActive: boolean;
}

export type ManagedCounterpartyRow =
	ReturnType<CrmCounterpartyRepository['find']> extends infer T ? NonNullable<T> : never;

const manager = alias(users, 'manager');

// Active portal accounts of the row: the same seats the staff limit counts.
const staffCount = sql<number>`(select count(*) from ${users} where ${users.counterpartyId} = ${counterparties.id} and ${users.isActive} = 1 and ${users.deletedAt} is null)`;

const SORTABLE = { name: counterparties.name };

/** Roles that may be the responsible manager of a counterparty (tech.md v1.39). */
const MANAGER_ROLES = ['manager', 'owner'] as const;

/** Workshop reads and writes of the counterparty card (C3). The route decides which one. */
export class CrmCounterpartyRepository extends BaseRepository<typeof counterparties> {
	constructor() {
		super(counterparties);
	}

	list(
		query: ListQuery<CrmCounterpartyFilters>,
		debtorsWhere: () => SQL
	): { rows: CounterpartyListRow[]; total: number } {
		const where = this.where(query, debtorsWhere);
		const [counted] = this.db()
			.select({ total: countExpression })
			.from(counterparties)
			.where(where)
			.all();
		const rows = this.db()
			.select({
				id: counterparties.id,
				name: counterparties.name,
				inn: counterparties.inn,
				managerName: manager.fullName,
				settlementScheme: counterparties.settlementScheme,
				staffCount,
				isActive: counterparties.isActive
			})
			.from(counterparties)
			.leftJoin(manager, eq(manager.id, counterparties.managerId))
			.where(where)
			.orderBy(
				orderByFor({ ...query, dir: query.dir ?? 'asc' }, SORTABLE, counterparties.name),
				asc(counterparties.id)
			)
			.limit(query.perPage)
			.offset(offsetFor(query))
			.all();
		return { rows, total: counted?.total ?? 0 };
	}

	find(id: number, tx?: Tx) {
		const [row] = this.db(tx)
			.select()
			.from(counterparties)
			.where(and(eq(counterparties.id, id), isNull(counterparties.deletedAt)))
			.all();
		return row;
	}

	insert(
		requisites: RequisitesInput,
		terms: Omit<TermsInput, 'staffLimit'>,
		staffLimit: number,
		tx: Tx
	): number {
		const [row] = this.db(tx)
			.insert(counterparties)
			.values({ ...requisites, ...terms, staffLimit })
			.returning({ id: counterparties.id })
			.all();
		if (!row) throw new Error('failed to insert a counterparty');
		return row.id;
	}

	update(
		id: number,
		patch: Partial<RequisitesInput & TermsInput & { notes: string | null }>,
		tx: Tx
	): void {
		this.db(tx).update(counterparties).set(patch).where(eq(counterparties.id, id)).run();
	}

	choices(tx?: Tx): CrmCounterpartyChoicesDto {
		return {
			managers: this.managerQuery(undefined, tx),
			priceLists: this.db(tx)
				.select({ id: priceLists.id, title: priceLists.title })
				.from(priceLists)
				.orderBy(asc(priceLists.title), asc(priceLists.id))
				.all()
		};
	}

	isManager(userId: number, tx?: Tx): boolean {
		return this.managerQuery(userId, tx).length > 0;
	}

	priceListExists(id: number, tx?: Tx): boolean {
		return (
			this.db(tx)
				.select({ id: priceLists.id })
				.from(priceLists)
				.where(eq(priceLists.id, id))
				.get() !== undefined
		);
	}

	private managerQuery(userId: number | undefined, tx?: Tx) {
		return this.db(tx)
			.selectDistinct({ id: users.id, fullName: users.fullName })
			.from(users)
			.innerJoin(userRoles, eq(userRoles.userId, users.id))
			.innerJoin(roles, eq(roles.id, userRoles.roleId))
			.where(
				and(
					eq(users.scope, 'crm'),
					eq(users.isActive, true),
					isNull(users.deletedAt),
					inArray(roles.code, [...MANAGER_ROLES]),
					userId === undefined ? undefined : eq(users.id, userId)
				)
			)
			.orderBy(asc(users.fullName), asc(users.id))
			.all();
	}

	private where(
		query: ListQuery<CrmCounterpartyFilters>,
		debtorsWhere: () => SQL
	): SQL | undefined {
		const filters = query.filters;
		const search = query.search;
		return and(
			isNull(counterparties.deletedAt),
			filters?.managerId === undefined
				? undefined
				: eq(counterparties.managerId, filters.managerId),
			filters?.scheme === undefined
				? undefined
				: eq(counterparties.settlementScheme, filters.scheme),
			filters?.hasDebt === true ? debtorsWhere() : undefined,
			search === undefined
				? undefined
				: or(containsText(counterparties.name, search), containsText(counterparties.inn, search))
		);
	}
}
