import type { PortalRole, StaffStatus } from '$lib/types/counterparty';
import type { SelectOption, StatusTone } from '$lib/ui';

export const ROLE_LABEL: Readonly<Record<PortalRole, string>> = {
	cp_admin: 'Администратор',
	cp_employee: 'Сотрудник'
};

export const STATUS_LABEL: Readonly<Record<StaffStatus, string>> = {
	active: 'Активен',
	invited: 'Приглашён',
	disabled: 'Отключён'
};

/** Tones come from the status dictionary of the kit, so the badge follows the palette. */
export const STATUS_TONE: Readonly<Record<StaffStatus, StatusTone>> = {
	active: 'success',
	invited: 'info',
	disabled: 'neutral'
};

function toOptions<K extends string>(labels: Readonly<Record<K, string>>): SelectOption[] {
	return (Object.entries(labels) as [K, string][]).map(([value, label]) => ({ value, label }));
}

export const ROLE_OPTIONS: readonly SelectOption[] = toOptions(ROLE_LABEL);
export const STATUS_OPTIONS: readonly SelectOption[] = toOptions(STATUS_LABEL);
