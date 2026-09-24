import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	TRANSITIONS,
	checkTransition,
	type ActorRole,
	type TransitionDenial
} from '../../src/lib/domain/request/state-machine';
import {
	STATUS_STAMPS,
	autoFollowUp,
	autoTransition,
	denialKind,
	stampFor
} from '../../src/lib/domain/request/transition-flow';
import { REQUEST_STATUSES } from '../../src/lib/types/request';
import { ROLE_CODES } from '../../src/lib/types/roles';

const status = fc.constantFrom(...REQUEST_STATUSES);

function assertProperty(property: fc.IPropertyWithHooks<unknown[]>): void {
	expect(() => fc.assert(property)).not.toThrow();
}

describe('transition flow of tech.md 6.2', () => {
	it('chains the automatic steps that close a delivered request', () => {
		const followed = REQUEST_STATUSES.filter((s) => autoFollowUp(s) !== undefined);

		expect(followed).toEqual(['delivered', 'awaiting_payment']);
		expect(autoFollowUp('delivered')).toBe('awaiting_payment');
		expect(autoFollowUp('awaiting_payment')).toBe('paid');
	});

	it('guards the last automatic step, so an unpaid request stops at awaiting_payment', () => {
		expect(autoTransition('awaiting_payment')?.guards).toEqual(['fullyPaid']);
		expect(autoTransition('delivered')?.guards).toBeUndefined();
	});

	it('lets only the system take the automatic step', () => {
		assertProperty(
			fc.property(status, fc.array(fc.constantFrom<ActorRole>(...ROLE_CODES)), (from, roles) => {
				const to = autoFollowUp(from);
				if (to === undefined) return true;
				return (
					checkTransition({
						from,
						to,
						actorRoles: roles,
						isOwnRequest: true,
						isAssigned: true,
						hasReason: true,
						guards: { stockCovered: true, pricesFixed: true, fullyPaid: true }
					}).ok === false
				);
			})
		);
	});

	it('stamps only statuses a transition can reach', () => {
		const reachable = new Set(TRANSITIONS.map((t) => t.to));

		for (const stamped of Object.keys(STATUS_STAMPS)) {
			expect(reachable.has(stamped as (typeof REQUEST_STATUSES)[number])).toBe(true);
		}
		expect(stampFor('delivered')).toBe('deliveredAt');
		expect(stampFor('cancelled')).toBeUndefined();
		expect(stampFor('awaiting_payment')).toBeUndefined();
	});

	it('maps a refusal to 409, 403 or 422 by its cause', () => {
		const cases: [TransitionDenial, string][] = [
			[{ code: 'unknown_transition' }, 'conflict'],
			[{ code: 'guard_failed', guard: 'fullyPaid' }, 'conflict'],
			[{ code: 'reason_required' }, 'validation'],
			[{ code: 'role_not_allowed' }, 'forbidden'],
			[{ code: 'not_owner' }, 'forbidden'],
			[{ code: 'not_assigned' }, 'forbidden']
		];

		for (const [denial, kind] of cases) expect(denialKind(denial)).toBe(kind);
	});
});
