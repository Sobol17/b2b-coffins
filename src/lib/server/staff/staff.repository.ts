import { and, asc, eq, isNotNull, isNull, like, or, type SQL } from 'drizzle-orm';
import { countExpression, offsetFor, orderByFor } from '../core/list';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { counterparties, roles, userRoles, users } from '../db/schema';
import type { ActorContext } from '$lib/types/actor';
import type { PortalRole, StaffFilters, StaffStatus } from '$lib/types/counterparty';
import type { ListQuery } from '$lib/types/list';
import type { RoleCode } from '$lib/types/roles';

export interface StaffRow {
	readonly id: number;
	readonly fullName: string;
	readonly email: string;
	readonly phone: string | null;
	readonly role: RoleCode;
	readonly isActive: boolean;
	readonly mustChangePassword: boolean;
	readonly lastLoginAt: Date | null;
}

export interface NewMember {
	readonly fullName: string;
	readonly email: string;
	readonly phone: string | null;
	readonly role: PortalRole;
	readonly counterpartyId: number;
	readonly passwordHash: string;
}

const COLUMNS = {
	id: users.id,
	fullName: users.fullName,
	email: users.email,
	phone: users.phone,
	role: roles.code,
	isActive: users.isActive,
	mustChangePassword: users.mustChangePassword,
	lastLoginAt: users.lastLoginAt
};

const SORTABLE = { fullName: users.fullName, lastLoginAt: users.lastLoginAt };

/** SQL twin of `staffStatus` in dto.ts: the filter and the badge must agree on every account. */
function statusWhere(status: StaffStatus): SQL | undefined {
	const neverSignedIn = and(eq(users.mustChangePassword, true), isNull(users.lastLoginAt));
	if (status === 'disabled') return eq(users.isActive, false);
	if (status === 'invited') return and(eq(users.isActive, true), neverSignedIn);
	return and(
		eq(users.isActive, true),
		or(eq(users.mustChangePassword, false), isNotNull(users.lastLoginAt))
	);
}

export class StaffRepository extends BaseRepository<typeof users> {
	constructor() {
		super(users);
	}

	list(ctx: ActorContext, query: ListQuery<StaffFilters>): { rows: StaffRow[]; total: number } {
		const filters = query.filters;
		// No lower-casing here: SQLite LIKE folds ASCII only, so a lowered Cyrillic name would never match.
		const pattern = query.search === undefined ? undefined : `%${query.search}%`;
		const where = this.members(
			ctx,
			and(
				filters?.role === undefined ? undefined : eq(roles.code, filters.role),
				filters?.status === undefined ? undefined : statusWhere(filters.status),
				pattern === undefined
					? undefined
					: or(like(users.fullName, pattern), like(users.email, pattern))
			)
		);
		const [counted] = this.db()
			.select({ total: countExpression })
			.from(users)
			.innerJoin(userRoles, eq(userRoles.userId, users.id))
			.innerJoin(roles, eq(roles.id, userRoles.roleId))
			.where(where)
			.all();
		const rows = this.db()
			.select(COLUMNS)
			.from(users)
			.innerJoin(userRoles, eq(userRoles.userId, users.id))
			.innerJoin(roles, eq(roles.id, userRoles.roleId))
			.where(where)
			.orderBy(
				orderByFor({ ...query, dir: query.dir ?? 'asc' }, SORTABLE, users.fullName),
				asc(users.id)
			)
			.limit(query.perPage)
			.offset(offsetFor(query))
			.all();
		return { rows, total: counted?.total ?? 0 };
	}

	findMember(ctx: ActorContext, id: number, tx?: Tx): StaffRow | undefined {
		const [row] = this.db(tx)
			.select(COLUMNS)
			.from(users)
			.innerJoin(userRoles, eq(userRoles.userId, users.id))
			.innerJoin(roles, eq(roles.id, userRoles.roleId))
			.where(this.members(ctx, eq(users.id, id)))
			.all();
		return row;
	}

	countActive(counterpartyId: number, tx?: Tx): number {
		const [row] = this.db(tx)
			.select({ total: countExpression })
			.from(users)
			.where(
				and(
					eq(users.counterpartyId, counterpartyId),
					eq(users.isActive, true),
					isNull(users.deletedAt)
				)
			)
			.all();
		return row?.total ?? 0;
	}

	staffLimit(counterpartyId: number, tx?: Tx): number {
		const [row] = this.db(tx)
			.select({ staffLimit: counterparties.staffLimit })
			.from(counterparties)
			.where(eq(counterparties.id, counterpartyId))
			.all();
		return row?.staffLimit ?? 0;
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

	insertMember(member: NewMember, tx?: Tx): number {
		const [created] = this.db(tx)
			.insert(users)
			.values({
				email: member.email,
				passwordHash: member.passwordHash,
				fullName: member.fullName,
				phone: member.phone,
				scope: 'portal',
				counterpartyId: member.counterpartyId,
				mustChangePassword: true
			})
			.returning({ id: users.id })
			.all();
		if (!created) throw new Error('failed to insert a staff member');
		this.db(tx)
			.insert(userRoles)
			.values({ userId: created.id, roleId: this.roleId(member.role, tx) })
			.run();
		return created.id;
	}

	setActive(id: number, isActive: boolean, tx?: Tx): void {
		this.db(tx).update(users).set({ isActive }).where(eq(users.id, id)).run();
	}

	/** A portal account holds exactly one role, so the change replaces it. */
	setRole(id: number, role: PortalRole, tx?: Tx): void {
		const roleId = this.roleId(role, tx);
		this.db(tx).delete(userRoles).where(eq(userRoles.userId, id)).run();
		this.db(tx).insert(userRoles).values({ userId: id, roleId }).run();
	}

	private roleId(role: PortalRole, tx?: Tx): number {
		const [row] = this.db(tx)
			.select({ id: roles.id })
			.from(roles)
			.where(eq(roles.code, role))
			.all();
		if (!row) throw new Error(`role ${role} is missing, run the seed first`);
		return row.id;
	}

	/** Portal accounts of the actor's own counterparty only (tech.md 12, row-level rule). */
	private members(ctx: ActorContext, extra: SQL | undefined): SQL | undefined {
		return this.scopedWhere(
			ctx,
			(counterpartyId) => eq(users.counterpartyId, counterpartyId),
			and(isNull(users.deletedAt), eq(users.scope, 'portal'), extra)
		);
	}
}
