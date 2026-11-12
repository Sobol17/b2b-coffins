import type { StaffPayRole } from '$lib/types/crm-payroll';
import { asc, desc, eq, inArray, isNull, and, ne } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { staff, users } from '../db/schema';
import { ConflictError, NotFoundError } from '../core/errors';

export interface StaffRow {
	readonly id: number;
	readonly payRole: StaffPayRole;
	readonly monthlySalaryMinor: number;
	readonly fullName: string;
	readonly position: string | null;
	readonly isActive: boolean;
	readonly userId: number | null;
}

const COLUMNS = {
	id: staff.id,
	payRole: staff.payRole,
	monthlySalaryMinor: staff.monthlySalaryMinor,
	fullName: staff.fullName,
	position: staff.position,
	isActive: staff.isActive,
	userId: staff.userId
};

/** The workshop crew of `staff`: a few dozen rows at most, so the lists come whole. */
export class PayrollStaffRepository extends BaseRepository<typeof staff> {
	constructor() {
		super(staff);
	}

	all(tx?: Tx): StaffRow[] {
		return this.db(tx)
			.select(COLUMNS)
			.from(staff)
			.orderBy(desc(staff.isActive), asc(staff.fullName), asc(staff.id))
			.all();
	}

	find(id: number, tx?: Tx): StaffRow | undefined {
		const [row] = this.db(tx).select(COLUMNS).from(staff).where(eq(staff.id, id)).all();
		return row;
	}

	forUser(userId: number, tx?: Tx): StaffRow | undefined {
		const rows = this.db(tx).select(COLUMNS).from(staff).where(eq(staff.userId, userId)).all();
		if (rows.length > 1)
			throw new ConflictError(
				'Учётная запись связана с несколькими сотрудниками. Исправьте связь в справочнике'
			);
		return rows[0];
	}

	ensureForUser(userId: number, tx: Tx): StaffRow {
		const existing = this.forUser(userId, tx);
		if (existing) {
			if (!existing.isActive) throw new ConflictError('Сотрудник выключен в справочнике выплат');
			return existing;
		}
		const account = tx
			.select({ fullName: users.fullName })
			.from(users)
			.where(
				and(
					eq(users.id, userId),
					eq(users.scope, 'crm'),
					eq(users.isActive, true),
					isNull(users.deletedAt)
				)
			)
			.get();
		if (!account) throw new NotFoundError('crm user');
		const row = tx
			.insert(staff)
			.values({ fullName: account.fullName, userId })
			.returning(COLUMNS)
			.get();
		if (!row) throw new Error('staff insert returned nothing');
		return row;
	}

	byIds(ids: readonly number[], tx?: Tx): StaffRow[] {
		if (ids.length === 0) return [];
		return this.db(tx)
			.select(COLUMNS)
			.from(staff)
			.where(inArray(staff.id, [...ids]))
			.all();
	}

	userChoices(): { id: number; fullName: string }[] {
		return this.db()
			.select({ id: users.id, fullName: users.fullName })
			.from(users)
			.where(and(eq(users.scope, 'crm'), isNull(users.deletedAt)))
			.orderBy(asc(users.fullName), asc(users.id))
			.all();
	}

	userExists(id: number, tx?: Tx): boolean {
		return (
			this.db(tx)
				.select({ id: users.id })
				.from(users)
				.where(and(eq(users.id, id), eq(users.scope, 'crm'), isNull(users.deletedAt)))
				.get() !== undefined
		);
	}

	userTaken(userId: number, exceptId: number | null, tx?: Tx): boolean {
		return (
			this.db(tx)
				.select({ id: staff.id })
				.from(staff)
				.where(
					and(eq(staff.userId, userId), exceptId === null ? undefined : ne(staff.id, exceptId))
				)
				.get() !== undefined
		);
	}

	insert(
		input: {
			fullName: string;
			position: string | null;
			userId?: number | null;
			payRole?: StaffPayRole;
			monthlySalaryMinor?: number;
		},
		tx?: Tx
	): number {
		const [created] = this.db(tx).insert(staff).values(input).returning({ id: staff.id }).all();
		if (!created) throw new Error('failed to insert a staff row');
		return created.id;
	}

	update(
		id: number,
		patch: {
			fullName?: string;
			payRole?: StaffPayRole;
			monthlySalaryMinor?: number;
			position?: string | null;
			userId?: number | null;
			isActive?: boolean;
		},
		tx?: Tx
	): void {
		this.db(tx).update(staff).set(patch).where(eq(staff.id, id)).run();
	}
}
