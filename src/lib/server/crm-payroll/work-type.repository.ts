import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { workTypes } from '../db/schema';
import type { WorkTypeDto } from '$lib/types/crm-payroll';

const COLUMNS = {
	id: workTypes.id,
	title: workTypes.title,
	rateMinor: workTypes.rateMinor,
	isActive: workTypes.isActive
};

/** Works and their prices (`work_types`, tech.md v1.48): a short list, read whole. */
export class WorkTypeRepository extends BaseRepository<typeof workTypes> {
	constructor() {
		super(workTypes);
	}

	all(tx?: Tx): WorkTypeDto[] {
		return this.db(tx)
			.select(COLUMNS)
			.from(workTypes)
			.orderBy(desc(workTypes.isActive), asc(workTypes.title), asc(workTypes.id))
			.all();
	}

	find(id: number, tx?: Tx): WorkTypeDto | undefined {
		const [row] = this.db(tx).select(COLUMNS).from(workTypes).where(eq(workTypes.id, id)).all();
		return row;
	}

	byIds(ids: readonly number[], tx?: Tx): WorkTypeDto[] {
		if (ids.length === 0) return [];
		return this.db(tx)
			.select(COLUMNS)
			.from(workTypes)
			.where(inArray(workTypes.id, [...ids]))
			.all();
	}

	titleTaken(title: string, exceptId: number | null, tx?: Tx): boolean {
		const [row] = this.db(tx)
			.select({ id: workTypes.id })
			.from(workTypes)
			.where(
				and(eq(workTypes.title, title), exceptId === null ? undefined : ne(workTypes.id, exceptId))
			)
			.all();
		return row !== undefined;
	}

	insert(input: { title: string; rateMinor: number }, tx?: Tx): number {
		const [created] = this.db(tx)
			.insert(workTypes)
			.values(input)
			.returning({ id: workTypes.id })
			.all();
		if (!created) throw new Error('failed to insert a work type');
		return created.id;
	}

	update(
		id: number,
		patch: { title?: string; rateMinor?: number; isActive?: boolean },
		tx?: Tx
	): void {
		this.db(tx).update(workTypes).set(patch).where(eq(workTypes.id, id)).run();
	}
}
