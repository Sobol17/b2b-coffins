export const ROLE_CODES = [
	'owner',
	'manager',
	'carpenter',
	'grinder',
	'painter',
	'upholsterer',
	'driver',
	'cp_admin',
	'cp_employee'
] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export const CRM_ROLES = [
	'owner',
	'manager',
	'carpenter',
	'grinder',
	'painter',
	'upholsterer',
	'driver'
] as const;
/**
 * Shop roles in the order a coffin passes them before the warehouse (v1.61). A work type may
 * belong to one of them; the payroll lists works in this order.
 */
export const WORK_ROLES = ['carpenter', 'grinder', 'painter', 'upholsterer'] as const;
export type WorkRole = (typeof WORK_ROLES)[number];
export const PORTAL_ROLES = ['cp_admin', 'cp_employee'] as const;

export type Scope = 'portal' | 'crm';
