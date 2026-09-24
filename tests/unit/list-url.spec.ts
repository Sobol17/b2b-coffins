import { describe, expect, it } from 'vitest';
import { filtersOf, listQueryOf, withListQuery } from '../../src/lib/utils/list-url';

describe('registry query in the url', () => {
	it('writes paging and sorting and keeps the filters already there', () => {
		const url = new URL('https://portal.example/portal/staff?status=invited&page=4');

		const next = withListQuery(url, { page: 2, perPage: 25, sort: 'fullName', dir: 'desc' });

		expect(next.searchParams.get('status')).toBe('invited');
		expect(next.searchParams.get('page')).toBe('2');
		expect(next.searchParams.get('sort')).toBe('fullName');
		expect(next.searchParams.get('dir')).toBe('desc');
	});

	it('leaves page 1 and an absent sort out of the url', () => {
		const url = new URL('https://portal.example/portal/staff?page=3&sort=fullName&dir=asc');

		const next = withListQuery(url, { page: 1, perPage: 25 });

		expect(next.searchParams.has('page')).toBe(false);
		expect(next.searchParams.has('sort')).toBe(false);
		expect(next.searchParams.has('dir')).toBe(false);
	});

	it('does not touch the url it was given', () => {
		const url = new URL('https://portal.example/portal/staff');

		withListQuery(url, { page: 5, perPage: 10 });

		expect(url.search).toBe('');
	});

	it('reads the sorting back and drops a tampered direction', () => {
		const url = new URL('https://crm.example/crm/settings/users?sort=fullName&dir=sideways');

		expect(listQueryOf(url, { page: 2, perPage: 25 })).toEqual({
			page: 2,
			perPage: 25,
			sort: 'fullName'
		});
	});

	it('reads only the filters of the bar and skips the empty ones', () => {
		const url = new URL('https://crm.example/crm/settings/audit?action=dict.create&entity=&page=2');

		expect(filtersOf(url, ['action', 'entity', 'actor'])).toEqual({ action: 'dict.create' });
	});
});
