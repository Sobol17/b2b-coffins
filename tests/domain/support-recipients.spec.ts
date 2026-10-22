import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	supportRecipients,
	type SupportAct,
	type SupportCandidate
} from '../../src/lib/domain/support/recipients';
import { SUPPORT_SIDES } from '../../src/lib/types/support';
import { CRM_ROLES, PORTAL_ROLES, type RoleCode } from '../../src/lib/types/roles';

const portalRoles = fc.subarray<RoleCode>([...PORTAL_ROLES], { minLength: 1 });
const crmRoles = fc.subarray<RoleCode>([...CRM_ROLES], { minLength: 1 });

const candidates: fc.Arbitrary<SupportCandidate[]> = fc
	.uniqueArray(fc.record({ userId: fc.integer({ min: 1, max: 30 }), portal: fc.boolean() }), {
		selector: (c) => c.userId,
		maxLength: 12
	})
	.chain((people) =>
		fc.tuple(
			...people.map((p) =>
				(p.portal ? portalRoles : crmRoles).map((roles): SupportCandidate => ({
					userId: p.userId,
					side: p.portal ? 'portal' : 'crm',
					roles
				}))
			)
		)
	);

const act: fc.Arbitrary<SupportAct> = fc.record({
	actorId: fc.integer({ min: 1, max: 30 }),
	actorSide: fc.constantFrom(...SUPPORT_SIDES),
	threadAuthorId: fc.integer({ min: 1, max: 30 })
});

describe('supportRecipients (tech.md 7.3, v1.57)', () => {
	it('never addresses the actor', () => {
		fc.assert(
			fc.property(act, candidates, (a, cs) => {
				expect(supportRecipients(a, cs).map((c) => c.userId)).not.toContain(a.actorId);
			})
		);
	});

	it('keeps a workshop act inside the portal', () => {
		fc.assert(
			fc.property(act, candidates, (a, cs) => {
				const sides = supportRecipients({ ...a, actorSide: 'crm' }, cs).map((c) => c.side);
				expect(sides).not.toContain('crm');
			})
		);
	});

	it('sends a portal act to the workshop, plus the thread author when somebody else acted', () => {
		fc.assert(
			fc.property(act, candidates, (a, cs) => {
				const portalAct = { ...a, actorSide: 'portal' as const };
				const got = supportRecipients(portalAct, cs);
				const portalOnes = got.filter((c) => c.side === 'portal');
				const workshop = cs.filter(
					(c) =>
						c.side === 'crm' &&
						c.userId !== a.actorId &&
						c.roles.some((r) => r === 'manager' || r === 'owner')
				);
				for (const c of portalOnes) expect(c.userId).toBe(a.threadAuthorId);
				for (const w of workshop) expect(got).toContain(w);
			})
		);
	});

	it('addresses only the workshop heads on the CRM side, never a driver or a carpenter', () => {
		fc.assert(
			fc.property(act, candidates, (a, cs) => {
				const workshop = supportRecipients({ ...a, actorSide: 'portal' }, cs).filter(
					(c) => c.side === 'crm'
				);
				for (const c of workshop) {
					expect(c.roles.some((r) => r === 'manager' || r === 'owner')).toBe(true);
				}
			})
		);
	});

	it('reaches every cp_admin and the thread author on a workshop act', () => {
		fc.assert(
			fc.property(act, candidates, (a, cs) => {
				const workshopAct = { ...a, actorSide: 'crm' as const };
				const got = supportRecipients(workshopAct, cs);
				const due = cs.filter(
					(c) =>
						c.side === 'portal' &&
						c.userId !== a.actorId &&
						(c.roles.includes('cp_admin') || c.userId === a.threadAuthorId)
				);
				for (const c of due) expect(got).toContain(c);
			})
		);
	});

	it('leaves a cp_employee who is not the author out', () => {
		const employee: SupportCandidate = { userId: 5, side: 'portal', roles: ['cp_employee'] };
		const author: SupportCandidate = { userId: 6, side: 'portal', roles: ['cp_employee'] };
		const got = supportRecipients({ actorId: 1, actorSide: 'crm', threadAuthorId: 6 }, [
			employee,
			author
		]);
		expect(got).toEqual([author]);
	});

	it('tells the employee when the cp_admin writes in the employee thread', () => {
		const admin: SupportCandidate = { userId: 2, side: 'portal', roles: ['cp_admin'] };
		const author: SupportCandidate = { userId: 6, side: 'portal', roles: ['cp_employee'] };
		const manager: SupportCandidate = { userId: 9, side: 'crm', roles: ['manager'] };
		const got = supportRecipients({ actorId: 2, actorSide: 'portal', threadAuthorId: 6 }, [
			admin,
			author,
			manager
		]);
		expect(got).toEqual([author, manager]);
	});
});
