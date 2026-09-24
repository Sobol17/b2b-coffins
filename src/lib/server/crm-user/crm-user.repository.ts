import { and, asc, eq, inArray, isNull, or, type SQL } from 'drizzle-orm';
import { countExpression, offsetFor, orderByFor } from '../core/list';
import { BaseRepository } from '../core/repository';
import { containsText } from '../core/search';
import type { Tx } from '../db/client';
import { roles, userRoles, users } from '../db/schema';
import { statusWhere } from '../staff/staff.repository';
import type { CrmRole, CrmUserFilters } from '$lib/types/crm';
import type { ListQuery } from '$lib/types/list';
import { CRM_ROLES, type RoleCode } from '$lib/types/roles';

export interface CrmUserRow {
	readonly id: number;
	readonly fullName: string;
	readonly email: string;
	readonly phone: string | null;
	readonly isActive: boolean;
	readonly mustChangePassword: boolean;
	readonly lastLoginAt: Date | null;
	readonly roles: readonly CrmRole[];
}

export interface NewCrmUser {
	readonly fullName: string;
	readonly email: string;
	readonly phone: string | null;
	readonly passwordHash: string;
}

type AccountRow = Omit<CrmUserRow, 'roles'>;

const COLUMNS = {
	id: users.id,
	fullName: users.fullName,
	email: users.email,
	phone: users.phone,
	isActive: users.isActive,
	mustChangePassword: users.mustChangePassword,
	lastLoginAt: users.lastLoginAt
};

const SORTABLE = { fullName: users.fullName, lastLoginAt: users.lastLoginAt };

function isCrmRole(code: RoleCode): code is CrmRole {
	return (CRM_ROLES as readonly RoleCode[]).includes(code);
}

/** Workshop accounts only: portal accounts belong to counterparties and never show up here. */
function workshop(extra?: SQL): SQL | undefined {
	return and(eq(users.scope, 'crm'), isNull(users.deletedAt), extra);
}

export class CrmUserRepository extends BaseRepository<typeof users> {
	constructor() {
		super(users);
	}

	list(query: ListQuery<CrmUserFilters>): { rows: CrmUserRow[]; total: number } {
		const { filters, search } = query;
		const where = workshop(
			and(
				filters?.role === undefined ? undefined : inArray(users.id, this.holdersOf(filters.role)),
				filters?.status === undefined ? undefined : statusWhere(filters.status),
				search === undefined
					? undefined
					: or(containsText(users.fullName, search), containsText(users.email, search))
			)
		);
		const [counted] = this.db().select({ total: countExpression }).from(users).where(where).all();
		const accounts = this.db()
			.select(COLUMNS)
			.from(users)
			.where(where)
			.orderBy(
				orderByFor({ ...query, dir: query.dir ?? 'asc' }, SORTABLE, users.fullName),
				asc(users.id)
			)
			.limit(query.perPage)
			.offset(offsetFor(query))
			.all();
		return { rows: this.withRoles(accounts), total: counted?.total ?? 0 };
	}

	find(id: number, tx?: Tx): CrmUserRow | undefined {
		const accounts = this.db(tx)
			.select(COLUMNS)
			.from(users)
			.where(workshop(eq(users.id, id)))
			.all();
		return this.withRoles(accounts, tx)[0];
	}

	/** Across all counterparties and the workshop: the address is the login of one account. */
	emailTaken(email: string, tx?: Tx): boolean {
		const [row] = this.db(tx)
			.select({ id: users.id })
			.from(users)
			.where(eq(users.email, email))
			.all();
		return row !== undefined;
	}

	insert(user: NewCrmUser, tx?: Tx): number {
		const [created] = this.db(tx)
			.insert(users)
			.values({ ...user, scope: 'crm', counterpartyId: null, mustChangePassword: true })
			.returning({ id: users.id })
			.all();
		if (!created) throw new Error('failed to insert a workshop account');
		return created.id;
	}

	setRoles(id: number, codes: readonly CrmRole[], tx?: Tx): void {
		const found = this.db(tx)
			.select({ id: roles.id, code: roles.code })
			.from(roles)
			.where(inArray(roles.code, [...codes]))
			.all();
		if (found.length !== codes.length) throw new Error('a CRM role is missing, run the seed first');
		this.db(tx).delete(userRoles).where(eq(userRoles.userId, id)).run();
		this.db(tx)
			.insert(userRoles)
			.values(found.map((role) => ({ userId: id, roleId: role.id })))
			.run();
	}

	setActive(id: number, isActive: boolean, tx?: Tx): void {
		this.db(tx).update(users).set({ isActive }).where(eq(users.id, id)).run();
	}

	/** A reset also lifts a lockout: the owner hands over a fresh password to get the person back in. */
	setTemporaryPassword(id: number, passwordHash: string, tx?: Tx): void {
		this.db(tx)
			.update(users)
			.set({ passwordHash, mustChangePassword: true, failedAttempts: 0, lockedUntil: null })
			.where(eq(users.id, id))
			.run();
	}

	private holdersOf(role: CrmRole) {
		return this.db()
			.select({ userId: userRoles.userId })
			.from(userRoles)
			.innerJoin(roles, eq(roles.id, userRoles.roleId))
			.where(eq(roles.code, role));
	}

	private withRoles(accounts: readonly AccountRow[], tx?: Tx): CrmUserRow[] {
		if (accounts.length === 0) return [];
		const links = this.db(tx)
			.select({ userId: userRoles.userId, code: roles.code })
			.from(userRoles)
			.innerJoin(roles, eq(roles.id, userRoles.roleId))
			.where(
				inArray(
					userRoles.userId,
					accounts.map((account) => account.id)
				)
			)
			.orderBy(asc(roles.id))
			.all();
		return accounts.map((account) => ({
			...account,
			roles: links
				.filter((link) => link.userId === account.id)
				.map((link) => link.code)
				.filter(isCrmRole)
		}));
	}
}
