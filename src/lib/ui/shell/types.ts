import type { ResolvedPathname } from '$app/types';
import type { Icon } from '@lucide/svelte';

/** The request chip of the portal header: where the draft lives and how many pieces it holds. */
export interface CartLink {
	readonly href: ResolvedPathname;
	readonly count: number;
}

export interface ShellLink {
	readonly href: ResolvedPathname;
	readonly label: string;
	/** CRM sidebar only: links with the same group sit under one heading, in the order they come. */
	readonly group?: string;
	/** CRM sidebar only: the icon that stays visible when the rail is collapsed. */
	readonly icon?: typeof Icon;
}
