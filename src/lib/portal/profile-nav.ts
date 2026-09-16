import { resolve } from '$app/paths';
import type { ResolvedPathname } from '$app/types';

export type ProfileSection = 'profile' | 'staff' | 'requests';

export interface ProfileNavItem {
	readonly href: ResolvedPathname;
	readonly label: string;
	readonly active: boolean;
}

/** One menu for the profile pages of the mockups: account, staff and the request registry. */
export function profileNavItems(
	current: ProfileSection,
	canManageStaff: boolean
): ProfileNavItem[] {
	const items: ProfileNavItem[] = [
		{ href: resolve('/portal/profile'), label: 'Профиль', active: current === 'profile' }
	];
	// A hint, not a guard: the staff page answers 403 to a role without the right anyway.
	if (canManageStaff) {
		items.push({
			href: resolve('/portal/staff'),
			label: 'Мои сотрудники',
			active: current === 'staff'
		});
	}
	items.push({
		href: resolve('/portal/requests'),
		label: 'Мои заявки',
		active: current === 'requests'
	});
	return items;
}
