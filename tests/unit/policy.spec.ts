import { describe, expect, it } from 'vitest';
import { ACTIONS, PolicyService } from '../../src/lib/server/auth/policy';
import {
	CRM_ROLES,
	PORTAL_ROLES,
	ROLE_CODES,
	WORK_ROLES,
	type RoleCode
} from '../../src/lib/types/roles';

const PRICE_BLIND: readonly RoleCode[] = [
	'cp_employee',
	'carpenter',
	'grinder',
	'painter',
	'upholsterer',
	'driver'
];

describe('PolicyService, the single point of permission checks', () => {
	it('keeps every role inside its own contour', () => {
		for (const role of CRM_ROLES) {
			expect(PolicyService.scopeOf([role])).toBe('crm');
			expect(PolicyService.can({ roles: [role] }, 'crm.access')).toBe(true);
			expect(PolicyService.can({ roles: [role] }, 'portal.access')).toBe(false);
		}
		for (const role of PORTAL_ROLES) {
			expect(PolicyService.scopeOf([role])).toBe('portal');
			expect(PolicyService.can({ roles: [role] }, 'portal.access')).toBe(true);
			expect(PolicyService.can({ roles: [role] }, 'crm.access')).toBe(false);
		}
	});

	it('denies price visibility to every role that must not see money', () => {
		for (const role of ROLE_CODES) {
			expect(PolicyService.canSeePrices([role])).toBe(!PRICE_BLIND.includes(role));
		}
	});

	it('shows cost price to the owner and the administrator only', () => {
		for (const role of ROLE_CODES) {
			expect(PolicyService.canSeeCost([role])).toBe(role === 'owner' || role === 'manager');
		}
		expect(PolicyService.can({ roles: ['manager'] }, 'catalog.cost.read')).toBe(true);
		expect(PolicyService.can({ roles: ['driver'] }, 'catalog.cost.read')).toBe(false);
		expect(PolicyService.can({ roles: ['owner'] }, 'catalog.cost.read')).toBe(true);
	});

	it('gives support threads to the portal roles and the workshop heads only (v1.57)', () => {
		for (const role of PORTAL_ROLES) {
			expect(PolicyService.can({ roles: [role] }, 'support.own')).toBe(true);
			expect(PolicyService.can({ roles: [role] }, 'support.any')).toBe(false);
		}
		for (const role of ['manager', 'owner'] as const) {
			expect(PolicyService.can({ roles: [role] }, 'support.any')).toBe(true);
			expect(PolicyService.can({ roles: [role] }, 'support.own')).toBe(false);
		}
		for (const role of ['driver', 'carpenter', 'grinder', 'painter', 'upholsterer'] as const) {
			expect(PolicyService.can({ roles: [role] }, 'support.own')).toBe(false);
			expect(PolicyService.can({ roles: [role] }, 'support.any')).toBe(false);
		}
	});

	it('never lets a price-blind role gain prices by holding a second role', () => {
		expect(PolicyService.canSeePrices(['cp_admin', 'cp_employee'])).toBe(false);
		expect(PolicyService.canSeePrices(['owner', 'driver'])).toBe(false);
	});

	it('grants the owner every action but the portal ones, and the shop roles no management', () => {
		// The agency price belongs to the counterparty, so the workshop owner does not hold it either.
		const portalOnly: readonly string[] = ['portal.access', 'prices.manage', 'support.own'];
		for (const action of ACTIONS) {
			expect(PolicyService.can({ roles: ['owner'] }, action)).toBe(!portalOnly.includes(action));
		}
		for (const role of ['carpenter', 'grinder', 'painter', 'upholsterer', 'driver'] as const) {
			expect(PolicyService.can({ roles: [role] }, 'settings.manage')).toBe(false);
			expect(PolicyService.can({ roles: [role] }, 'payroll.manage')).toBe(false);
			expect(PolicyService.can({ roles: [role] }, 'request.read.any')).toBe(false);
		}
	});

	it('gives the grinder and the upholsterer what the carpenter has (v1.61)', () => {
		for (const role of ['grinder', 'upholsterer'] as const) {
			expect(PolicyService.scopeOf([role])).toBe('crm');
			for (const action of ACTIONS) {
				expect(PolicyService.can({ roles: [role] }, action)).toBe(
					PolicyService.can({ roles: ['carpenter'] }, action)
				);
			}
		}
	});

	it('keeps the shop roles in the order of the floor: carpenter, grinder, painter, upholsterer', () => {
		expect(WORK_ROLES).toEqual(['carpenter', 'grinder', 'painter', 'upholsterer']);
		const crm = [...CRM_ROLES];
		expect(crm.indexOf('grinder')).toBe(crm.indexOf('carpenter') + 1);
		expect(crm.indexOf('upholsterer')).toBe(crm.indexOf('painter') + 1);
	});

	it('denies everything to an actor with no roles at all', () => {
		for (const action of ACTIONS) {
			expect(PolicyService.can({ roles: [] }, action)).toBe(false);
		}
		expect(PolicyService.canSeePrices([])).toBe(false);
	});
});

describe('reports and the fund (C13, tech.md v1.51)', () => {
	it('opens the reports to the owner only', () => {
		for (const role of ROLE_CODES) {
			expect(PolicyService.can({ roles: [role] }, 'reports.read')).toBe(role === 'owner');
			expect(PolicyService.can({ roles: [role] }, 'charity.manage')).toBe(role === 'owner');
		}
	});
});

describe('finance (C18, tech.md v1.58)', () => {
	it('opens the money page to the owner only', () => {
		for (const role of ROLE_CODES) {
			expect(PolicyService.can({ roles: [role] }, 'finance.manage')).toBe(role === 'owner');
		}
	});
});
