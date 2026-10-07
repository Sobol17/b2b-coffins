import type { ShellLink } from './types';

export interface LinkGroup<TLink extends ShellLink> {
	readonly name: string;
	readonly items: readonly TLink[];
}

/** Links under their group headings, groups in the order of their first link. Ungrouped are left out. */
export function groupLinks<TLink extends ShellLink>(links: readonly TLink[]): LinkGroup<TLink>[] {
	const names = links
		.map((link) => link.group)
		.filter(
			(name, index, all): name is string => name !== undefined && all.indexOf(name) === index
		);
	return names.map((name) => ({ name, items: links.filter((link) => link.group === name) }));
}
