import { checkTransition, type TransitionInput } from '$lib/domain/request/state-machine';
import type { ActorContext } from '$lib/types/actor';
import { CRM_ROLES, PORTAL_ROLES, type RoleCode, type Scope } from '$lib/types/roles';

export const ACTIONS = [
	'portal.access',
	'crm.access',
	'catalog.read',
	'catalog.manage',
	'catalog.cost.read',
	'request.create',
	'request.read.own',
	'request.read.any',
	'request.assign',
	'counterparty.manage',
	'counterparty.staff.manage',
	'stock.read',
	'stock.manage',
	'payroll.read',
	'payroll.manage',
	'reports.read',
	'settings.manage',
	'audit.read'
] as const;
export type Action = (typeof ACTIONS)[number];

/**
 * Role to action matrix. Hiding a button is cosmetics; this table is what actually decides,
 * and every mutating route calls it before it touches a service.
 */
const GRANTS: Readonly<Record<RoleCode, readonly Action[]>> = {
	// Owner holds every action except the portal one: the portal contour belongs to counterparties.
	owner: ACTIONS.filter((action) => action !== 'portal.access'),
	manager: [
		'crm.access',
		'catalog.read',
		'catalog.manage',
		'request.read.any',
		'request.create',
		'request.assign',
		'counterparty.manage',
		'counterparty.staff.manage',
		'stock.read',
		'stock.manage',
		'payroll.read',
		'payroll.manage',
		'reports.read'
	],
	carpenter: ['crm.access', 'catalog.read', 'request.read.own', 'stock.read'],
	painter: ['crm.access', 'catalog.read', 'request.read.own', 'stock.read'],
	driver: ['crm.access', 'request.read.own'],
	cp_admin: [
		'portal.access',
		'catalog.read',
		'request.create',
		'request.read.own',
		'counterparty.staff.manage'
	],
	cp_employee: ['portal.access', 'catalog.read', 'request.create', 'request.read.own']
} as const;

/** Roles that must never see a price field, on any screen or in any response body. */
const PRICE_BLIND_ROLES: readonly RoleCode[] = ['cp_employee', 'carpenter', 'painter', 'driver'];

export class PolicyService {
	static can(actor: Pick<ActorContext, 'roles'>, action: Action): boolean {
		return actor.roles.some((role) => GRANTS[role].includes(action));
	}

	static scopeOf(roles: readonly RoleCode[]): Scope {
		return roles.some((role) => (CRM_ROLES as readonly RoleCode[]).includes(role))
			? 'crm'
			: 'portal';
	}

	static canSeePrices(roles: readonly RoleCode[]): boolean {
		return roles.length > 0 && roles.every((role) => !PRICE_BLIND_ROLES.includes(role));
	}

	static canSeeCost(roles: readonly RoleCode[]): boolean {
		return roles.includes('owner');
	}

	static isPortalRole(role: RoleCode): boolean {
		return (PORTAL_ROLES as readonly RoleCode[]).includes(role);
	}

	/** Status moves go through the domain table, so the server and the UI cannot drift apart. */
	static canTransition(input: TransitionInput): boolean {
		return checkTransition(input).ok;
	}
}
