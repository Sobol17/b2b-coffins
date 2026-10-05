import { asc, desc, eq, inArray } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { staff } from '../db/schema';

export interface StaffRow {
	readonly id: number;
	readonly fullName: string;
	readonly position: string | null;
	readonly isActive: boolean;
	readonly userId: number | null;
}

const COLUMNS = {
	id: staff.id,
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

	byIds(ids: readonly number[], tx?: Tx): StaffRow[] {
		if (ids.length === 0) return [];
		return this.db(tx)
			.select(COLUMNS)
			.from(staff)
			.where(inArray(staff.id, [...ids]))
			.all();
	}

	insert(input: { fullName: string; position: string | null }, tx?: Tx): number {
		const [created] = this.db(tx).insert(staff).values(input).returning({ id: staff.id }).all();
		if (!created) throw new Error('failed to insert a staff row');
		return created.id;
	}

	update(
		id: number,
		patch: { fullName?: string; position?: string | null; isActive?: boolean },
		tx?: Tx
	): void {
		this.db(tx).update(staff).set(patch).where(eq(staff.id, id)).run();
	}
}
