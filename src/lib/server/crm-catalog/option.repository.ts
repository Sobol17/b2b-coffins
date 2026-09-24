import { and, asc, eq, inArray } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { options } from '../db/schema';
import type { CrmOptionDto } from '$lib/types/crm-catalog';
import type { OptionInput } from '$lib/validation/crm-catalog';

export class ManagedOptionRepository extends BaseRepository<typeof options> {
	constructor() {
		super(options);
	}

	list(tx?: Tx): CrmOptionDto[] {
		return this.db(tx)
			.select({
				id: options.id,
				kind: options.kind,
				title: options.title,
				priceDeltaMinor: options.priceDeltaMinor,
				stockItemId: options.stockItemId,
				isActive: options.isActive
			})
			.from(options)
			.orderBy(asc(options.title), asc(options.id))
			.all();
	}

	find(id: number, tx?: Tx): CrmOptionDto | undefined {
		return this.list(tx).find((row) => row.id === id);
	}

	activeIds(ids: readonly number[], tx: Tx): Set<number> {
		if (ids.length === 0) return new Set();
		return new Set(
			this.db(tx)
				.select({ id: options.id })
				.from(options)
				.where(and(inArray(options.id, [...ids]), eq(options.isActive, true)))
				.all()
				.map((row) => row.id)
		);
	}

	insert(input: OptionInput, tx: Tx): number {
		const [row] = this.db(tx)
			.insert(options)
			.values({ ...input, kind: 'color' })
			.returning({ id: options.id })
			.all();
		if (!row) throw new Error('failed to insert option');
		return row.id;
	}

	update(id: number, input: OptionInput, tx: Tx): void {
		this.db(tx).update(options).set(input).where(eq(options.id, id)).run();
	}

	setActive(id: number, isActive: boolean, tx: Tx): void {
		this.db(tx).update(options).set({ isActive }).where(eq(options.id, id)).run();
	}
}
