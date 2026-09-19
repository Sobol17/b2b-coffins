import { asc, desc, sql, type SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import type { ListQuery } from '$lib/types/list';
import { listQueryKey } from '$lib/utils/list-url';

export const DEFAULT_PER_PAGE = 25;
const MAX_PER_PAGE = 200;

/** Query strings are user input: a bad page number must clamp, not throw or scan the whole table. */
export function normalizeListQuery<F>(query: Partial<ListQuery<F>>): ListQuery<F> {
	const page = Math.max(1, Math.trunc(query.page ?? 1));
	const perPage = Math.min(
		MAX_PER_PAGE,
		Math.max(1, Math.trunc(query.perPage ?? DEFAULT_PER_PAGE))
	);
	return {
		page,
		perPage,
		...(query.sort === undefined ? {} : { sort: query.sort }),
		...(query.dir === undefined ? {} : { dir: query.dir }),
		...(query.search === undefined ? {} : { search: query.search }),
		...(query.filters === undefined ? {} : { filters: query.filters })
	};
}

/**
 * `prefix` gives a second registry on the same page its own keys (`feedPage`), so paging one table
 * does not move the other (P12).
 */
export function parseListQuery<F>(url: URL, filters?: F, prefix = ''): ListQuery<F> {
	const key = listQueryKey(prefix);
	const dir = url.searchParams.get(key('dir'));
	const search = url.searchParams.get(key('search'));
	const sort = url.searchParams.get(key('sort'));
	return normalizeListQuery<F>({
		page: Number(url.searchParams.get(key('page')) ?? 1),
		perPage: Number(url.searchParams.get(key('perPage')) ?? DEFAULT_PER_PAGE),
		...(sort === null ? {} : { sort }),
		...(dir === 'asc' || dir === 'desc' ? { dir } : {}),
		...(search === null || search === '' ? {} : { search }),
		...(filters === undefined ? {} : { filters })
	});
}

/**
 * Whitelisted sort: the column comes from a map the repository owns, never from the query string,
 * so a crafted `sort` cannot reach an unindexed or private column.
 */
export function orderByFor(
	query: ListQuery<unknown>,
	sortable: Readonly<Record<string, SQLiteColumn>>,
	fallback: SQLiteColumn
): SQL {
	const column = query.sort === undefined ? undefined : sortable[query.sort];
	return query.dir === 'asc' ? asc(column ?? fallback) : desc(column ?? fallback);
}

export function offsetFor(query: ListQuery<unknown>): number {
	return (query.page - 1) * query.perPage;
}

export const countExpression = sql<number>`count(*)`;
