import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	TRANSITIONS,
	checkTransition,
	findTransition,
	targetsForRole,
	type ActorRole,
	type TransitionInput
} from '../../src/lib/domain/request/state-machine';
import {
	GUARD_CODES,
	REQUEST_STATUSES,
	type GuardCode,
	type RequestStatus
} from '../../src/lib/types/request';
import { ROLE_CODES } from '../../src/lib/types/roles';

const MAIN_FLOW: readonly RequestStatus[] = [
	'draft',
	'new',
	'in_work',
	'ready',
	'delivered',
	'awaiting_payment',
	'paid'
];

const status = fc.constantFrom(...REQUEST_STATUSES);
const actorRole = fc.constantFrom<ActorRole>(...ROLE_CODES, 'system');

/** Every guard up, built from the list so a new guard code cannot quietly slip past this suite. */
const ALL_GUARDS_UP = Object.fromEntries(GUARD_CODES.map((code) => [code, true])) as Record<
	GuardCode,
	boolean
>;

/** Passes every gate the transition can ask for, so only the table itself decides. */
function permissive(from: RequestStatus, to: RequestStatus, roles: readonly ActorRole[]) {
	return {
		from,
		to,
		actorRoles: roles,
		isOwnRequest: true,
		isAssigned: true,
		hasReason: true,
		guards: ALL_GUARDS_UP
	} satisfies TransitionInput;
}

/** vitest runs with requireAssertions, so a property is asserted through expect, not bare. */
function assertProperty(property: fc.IPropertyWithHooks<unknown[]>): void {
	expect(() => fc.assert(property)).not.toThrow();
}

describe('request state machine, invariants of tech.md 6.2', () => {
	it('moves forward only: the table lists no step back along the main flow', () => {
		const backwards = TRANSITIONS.filter((t) => {
			const fromIndex = MAIN_FLOW.indexOf(t.from);
			const toIndex = MAIN_FLOW.indexOf(t.to);
			return fromIndex >= 0 && toIndex >= 0 && toIndex < fromIndex;
		});

		expect(backwards).toEqual([]);
	});

	it('rejects every pair that the table does not list', () => {
		assertProperty(
			fc.property(status, status, fc.array(actorRole, { minLength: 1 }), (from, to, roles) => {
				const result = checkTransition(permissive(from, to, roles));
				const listed = findTransition(from, to);

				if (!listed) return result.ok === false && result.denial.code === 'unknown_transition';
				return result.ok === listed.roles.some((role) => roles.includes(role));
			})
		);
	});

	it('never leaves a terminal status', () => {
		assertProperty(
			fc.property(status, fc.array(actorRole, { minLength: 1 }), (to, roles) => {
				for (const from of ['paid', 'cancelled', 'rejected'] as const) {
					if (checkTransition(permissive(from, to, roles)).ok) return false;
				}
				return true;
			})
		);
	});

	it('demands a reason on every transition marked requiresReason', () => {
		for (const transition of TRANSITIONS.filter((t) => t.requiresReason)) {
			const input = {
				...permissive(transition.from, transition.to, transition.roles),
				hasReason: false
			};

			const result = checkTransition(input);

			expect(result).toEqual({ ok: false, denial: { code: 'reason_required' } });
		}
	});

	it('blocks in_work and ready without an assignee', () => {
		for (const transition of TRANSITIONS.filter((t) => t.guards?.includes('hasAssignee'))) {
			const input = {
				...permissive(transition.from, transition.to, transition.roles),
				guards: { hasAssignee: false, pricesFixed: true, fullyPaid: true }
			};

			const result = checkTransition(input);

			expect(result).toEqual({ ok: false, denial: { code: 'guard_failed', guard: 'hasAssignee' } });
		}
	});

	it('keeps every automatic step away from humans', () => {
		assertProperty(
			fc.property(fc.constantFrom(...ROLE_CODES), (role) => {
				return TRANSITIONS.filter((t) => t.auto === true).every((t) => {
					const result = checkTransition(permissive(t.from, t.to, [role]));
					return result.ok === false && result.denial.code === 'role_not_allowed';
				});
			})
		);

		expect(checkTransition(permissive('delivered', 'awaiting_payment', ['system'])).ok).toBe(true);
		expect(checkTransition(permissive('awaiting_payment', 'paid', ['system'])).ok).toBe(true);
	});

	it('offers a role only the targets the table grants it', () => {
		assertProperty(
			fc.property(status, actorRole, (from, role) => {
				return targetsForRole(from, [role]).every((to) => {
					const listed = findTransition(from, to);
					return listed !== undefined && listed.roles.includes(role);
				});
			})
		);
	});

	it('closes the payment step behind the fullyPaid guard', () => {
		const input = {
			...permissive('awaiting_payment', 'paid', ['system']),
			guards: { fullyPaid: false }
		};

		expect(checkTransition(input)).toEqual({
			ok: false,
			denial: { code: 'guard_failed', guard: 'fullyPaid' }
		});
	});
});
