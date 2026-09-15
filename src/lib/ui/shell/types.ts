import type { ResolvedPathname } from '$app/types';

export interface ShellLink {
	readonly href: ResolvedPathname;
	readonly label: string;
}
