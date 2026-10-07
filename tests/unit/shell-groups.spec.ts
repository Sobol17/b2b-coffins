import { describe, expect, it } from 'vitest';
import { groupLinks } from '$lib/ui/shell/groups';
import type { ShellLink } from '$lib/ui/shell/types';

const link = (href: string, group?: string): ShellLink =>
	({ href, label: href, ...(group === undefined ? {} : { group }) }) as ShellLink;

describe('groupLinks', () => {
	it('keeps groups in the order of their first link and links in their own order', () => {
		const groups = groupLinks([link('/a', 'One'), link('/b', 'Two'), link('/c', 'One')]);
		expect(groups.map((group) => group.name)).toEqual(['One', 'Two']);
		expect(groups[0]?.items.map((item) => item.href)).toEqual(['/a', '/c']);
	});

	it('leaves ungrouped links out: the shell prints them in the account block', () => {
		const groups = groupLinks([link('/a', 'One'), link('/password')]);
		expect(groups.flatMap((group) => group.items.map((item) => item.href))).toEqual(['/a']);
	});

	it('returns nothing for a role without sections', () => {
		expect(groupLinks([])).toEqual([]);
	});
});
