import type { ResolvedPathname } from '$app/types';

/** The request chip of the portal header: where the draft lives and how many pieces it holds. */
export interface CartLink {
	readonly href: ResolvedPathname;
	readonly count: number;
}

export interface ShellLink {
	readonly href: ResolvedPathname;
	readonly label: string;
}
