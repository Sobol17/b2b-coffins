import { and, asc, eq, or } from 'drizzle-orm';
import { countExpression, offsetFor, orderByFor } from '../core/list';
import { BaseRepository } from '../core/repository';
import { containsText } from '../core/search';
import type { Tx } from '../db/client';
import { dictItems } from '../db/schema';
import type { DictItemDto, DictItemFilters } from '$lib/types/crm';
import type { DictCode } from '$lib/types/dicts';
import type { ListQuery } from '$lib/types/list';

const COLUMNS = {
	id: dictItems.id,
	dict: dictItems.dict,
	code: dictItems.code,
	title: dictItems.title,
	sortOrder: dictItems.sortOrder,
	isActive: dictItems.isActive
};

const SORTABLE = { sortOrder: dictItems.sortOrder, title: dictItems.title, code: dictItems.code };

export class DictRepository extends BaseRepository<typeof dictItems> {
	constructor() {
		super(dictItems);
	}

	list(query: ListQuery<DictItemFilters>): { rows: DictItemDto[]; total: number } {
		const dict = query.filters?.dict;
		const where = and(
			dict === undefined ? undefined : eq(dictItems.dict, dict),
			query.search === undefined
				? undefined
				: or(
						containsText(dictItems.title, query.search),
						containsText(dictItems.code, query.search)
					)
		);
		const [counted] = this.db()
			.select({ total: countExpression })
			.from(dictItems)
			.where(where)
			.all();
		const rows = this.db()
			.select(COLUMNS)
			.from(dictItems)
			.where(where)
			.orderBy(
				orderByFor({ ...query, dir: query.dir ?? 'asc' }, SORTABLE, dictItems.sortOrder),
				asc(dictItems.title),
				asc(dictItems.id)
			)
			.limit(query.perPage)
			.offset(offsetFor(query))
			.all();
		return { rows, total: counted?.total ?? 0 };
	}

	find(id: number, tx?: Tx): DictItemDto | undefined {
		const [row] = this.db(tx).select(COLUMNS).from(dictItems).where(eq(dictItems.id, id)).all();
		return row;
	}

	codeTaken(dict: DictCode, code: string, tx?: Tx): boolean {
		const [row] = this.db(tx)
			.select({ id: dictItems.id })
			.from(dictItems)
			.where(and(eq(dictItems.dict, dict), eq(dictItems.code, code)))
			.all();
		return row !== undefined;
	}

	insert(
		item: { dict: DictCode; code: string; title: string; sortOrder: number },
		tx?: Tx
	): number {
		const [created] = this.db(tx)
			.insert(dictItems)
			.values({ ...item, isActive: true })
			.returning({ id: dictItems.id })
			.all();
		if (!created) throw new Error('failed to insert a dictionary item');
		return created.id;
	}

	update(id: number, patch: { title?: string; sortOrder?: number; isActive?: boolean }, tx?: Tx) {
		this.db(tx).update(dictItems).set(patch).where(eq(dictItems.id, id)).run();
	}
}
