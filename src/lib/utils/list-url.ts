import type { ListQuery } from '$lib/types/list';

/**
 * Writes paging and sorting of a registry into a copy of the page url. Filters already sit in the
 * query string (FilterBar keeps them there), so they are left as they are.
 */
export function withListQuery(url: URL, query: ListQuery): URL {
	const next = new URL(url);
	const params: ReadonlyArray<readonly [string, string | undefined]> = [
		// Page 1 is the default, so it stays out of the url instead of making two links for one view.
		['page', query.page > 1 ? String(query.page) : undefined],
		['perPage', String(query.perPage)],
		['sort', query.sort],
		['dir', query.dir]
	];
	for (const [key, value] of params) {
		if (value === undefined) next.searchParams.delete(key);
		else next.searchParams.set(key, value);
	}
	return next;
}
