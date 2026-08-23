export const ROLE_CODES = [
	'owner',
	'manager',
	'carpenter',
	'painter',
	'driver',
	'cp_admin',
	'cp_employee'
] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export const CRM_ROLES = ['owner', 'manager', 'carpenter', 'painter', 'driver'] as const;
export const PORTAL_ROLES = ['cp_admin', 'cp_employee'] as const;

export type Scope = 'portal' | 'crm';
