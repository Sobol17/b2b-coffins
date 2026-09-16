import { resolve } from '$app/paths';
import type { ResolvedPathname } from '$app/types';

export type ProfileSection = 'profile' | 'staff' | 'prices' | 'requests';

export interface ProfileNavItem {
	readonly href: ResolvedPathname;
	readonly label: string;
	readonly active: boolean;
}

export interface ProfileNavRights {
	readonly staff: boolean;
	readonly prices: boolean;
}

/** One menu for the profile pages: account, staff, agency prices and the request registry. */
export function profileNavItems(
	current: ProfileSection,
	rights: ProfileNavRights
): ProfileNavItem[] {
	const items: ProfileNavItem[] = [
		{ href: resolve('/portal/profile'), label: 'Профиль', active: current === 'profile' }
	];
	// A hint, not a guard: each page answers 403 to a role without the right anyway.
	if (rights.staff) {
		items.push({
			href: resolve('/portal/staff'),
			label: 'Мои сотрудники',
			active: current === 'staff'
		});
	}
	if (rights.prices) {
		items.push({
			href: resolve('/portal/prices'),
			label: 'Мои цены',
			active: current === 'prices'
		});
	}
	items.push({
		href: resolve('/portal/requests'),
		label: 'Мои заявки',
		active: current === 'requests'
	});
	return items;
}
