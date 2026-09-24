import type { ListQuery } from '$lib/types/list';

/** Query-string key of one registry: `page` without a prefix, `feedPage` with one. */
export function listQueryKey(prefix: string): (name: string) => string {
	return (name) =>
		prefix === '' ? name : `${prefix}${(name[0] ?? '').toUpperCase()}${name.slice(1)}`;
}

/**
 * Writes paging and sorting of a registry into a copy of the page url. Filters already sit in the
 * query string (FilterBar keeps them there), so they are left as they are.
 */
export function withListQuery(url: URL, query: ListQuery, prefix = ''): URL {
	const key = listQueryKey(prefix);
	const next = new URL(url);
	const params: ReadonlyArray<readonly [string, string | undefined]> = [
		// Page 1 is the default, so it stays out of the url instead of making two links for one view.
		[key('page'), query.page > 1 ? String(query.page) : undefined],
		[key('perPage'), String(query.perPage)],
		[key('sort'), query.sort],
		[key('dir'), query.dir]
	];
	for (const [name, value] of params) {
		if (value === undefined) next.searchParams.delete(name);
		else next.searchParams.set(name, value);
	}
	return next;
}

/**
 * Query a registry table shows: the server's page and page size plus the sorting in the url.
 * The server already clamped paging, so only sorting is read back from the query string.
 */
export function listQueryOf(url: URL, paging: { page: number; perPage: number }): ListQuery {
	const sort = url.searchParams.get('sort');
	const dir = url.searchParams.get('dir');
	return {
		page: paging.page,
		perPage: paging.perPage,
		...(sort === null ? {} : { sort }),
		...(dir === 'asc' || dir === 'desc' ? { dir } : {})
	};
}

/** Filter values of a FilterBar from the url, without the empty ones. */
export function filtersOf(url: URL, keys: readonly string[]): Record<string, string> {
	const entries = keys.map((key) => [key, url.searchParams.get(key) ?? ''] as const);
	return Object.fromEntries(entries.filter(([, value]) => value !== ''));
}
