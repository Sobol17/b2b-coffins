import { resolve } from '$app/paths';
import type { ResolvedPathname } from '$app/types';

export type ProfileSection =
	'profile' | 'staff' | 'prices' | 'requests' | 'support' | 'notifications';

export interface ProfileNavItem {
	readonly href: ResolvedPathname;
	readonly label: string;
	readonly active: boolean;
}

export interface ProfileNavRights {
	readonly staff: boolean;
	readonly prices: boolean;
}

/** One menu for the profile pages: account, staff, prices, requests, chat and notifications. */
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
	// Both portal roles write to the workshop (v1.57); the employee sees only the own threads.
	items.push({ href: resolve('/portal/support'), label: 'Чат', active: current === 'support' });
	items.push({
		href: resolve('/portal/profile/notifications'),
		label: 'Уведомления',
		active: current === 'notifications'
	});
	return items;
}
