import { describe, expect, it } from 'vitest';
import { ACTIONS, PolicyService } from '../../src/lib/server/auth/policy';
import { CRM_ROLES, PORTAL_ROLES, ROLE_CODES, type RoleCode } from '../../src/lib/types/roles';

const PRICE_BLIND: readonly RoleCode[] = ['cp_employee', 'carpenter', 'painter', 'driver'];

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

	it('shows cost price to the owner alone', () => {
		for (const role of ROLE_CODES) {
			expect(PolicyService.canSeeCost([role])).toBe(role === 'owner');
		}
		expect(PolicyService.can({ roles: ['manager'] }, 'catalog.cost.read')).toBe(false);
		expect(PolicyService.can({ roles: ['owner'] }, 'catalog.cost.read')).toBe(true);
	});

	it('never lets a price-blind role gain prices by holding a second role', () => {
		expect(PolicyService.canSeePrices(['cp_admin', 'cp_employee'])).toBe(false);
		expect(PolicyService.canSeePrices(['owner', 'driver'])).toBe(false);
	});

	it('grants the owner every action but portal access, and the shop roles no management', () => {
		for (const action of ACTIONS) {
			expect(PolicyService.can({ roles: ['owner'] }, action)).toBe(action !== 'portal.access');
		}
		for (const role of ['carpenter', 'painter', 'driver'] as const) {
			expect(PolicyService.can({ roles: [role] }, 'settings.manage')).toBe(false);
			expect(PolicyService.can({ roles: [role] }, 'payroll.manage')).toBe(false);
			expect(PolicyService.can({ roles: [role] }, 'request.read.any')).toBe(false);
		}
	});

	it('denies everything to an actor with no roles at all', () => {
		for (const action of ACTIONS) {
			expect(PolicyService.can({ roles: [] }, action)).toBe(false);
		}
		expect(PolicyService.canSeePrices([])).toBe(false);
	});
});
