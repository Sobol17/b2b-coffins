import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { evaluateGuards, fullyPaid, pricesFixed } from '../../src/lib/domain/request/guards';
import {
	TRANSITIONS,
	checkTransition,
	type ActorRole,
	type TransitionDenial
} from '../../src/lib/domain/request/state-machine';
import {
	STATUS_STAMPS,
	autoFollowUp,
	denialKind,
	stampFor
} from '../../src/lib/domain/request/transition-flow';
import { GUARD_CODES, REQUEST_STATUSES } from '../../src/lib/types/request';
import { ROLE_CODES } from '../../src/lib/types/roles';

const status = fc.constantFrom(...REQUEST_STATUSES);
const minor = fc.integer({ min: 0, max: 100_000_000 });

function assertProperty(property: fc.IPropertyWithHooks<unknown[]>): void {
	expect(() => fc.assert(property)).not.toThrow();
}

describe('transition flow of tech.md 6.2', () => {
	it('follows delivered with awaiting_payment and nothing else with an automatic step', () => {
		const followed = REQUEST_STATUSES.filter((s) => autoFollowUp(s) !== undefined);

		expect(followed).toEqual(['delivered']);
		expect(autoFollowUp('delivered')).toBe('awaiting_payment');
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
						guards: { hasAssignee: true, pricesFixed: true, fullyPaid: true }
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

describe('request guards', () => {
	it('treats a request without lines or with a zero price as not priced', () => {
		expect(pricesFixed([])).toBe(false);
		assertProperty(
			fc.property(fc.array(minor, { minLength: 1 }), (prices) => {
				return pricesFixed(prices) === prices.every((price) => price > 0);
			})
		);
	});

	it('counts a request paid exactly when the marks cover the total', () => {
		assertProperty(
			fc.property(minor, fc.array(minor), (total, marks) => {
				const sum = marks.reduce((a, b) => a + b, 0);
				return fullyPaid(total, marks) === sum >= total;
			})
		);
	});

	it('never takes paid back when one more mark arrives', () => {
		assertProperty(
			fc.property(minor, fc.array(minor), minor, (total, marks, extra) => {
				return !fullyPaid(total, marks) || fullyPaid(total, [...marks, extra]);
			})
		);
	});

	it('answers every guard code the table can ask for', () => {
		assertProperty(
			fc.property(
				fc.nat(5),
				fc.array(minor),
				minor,
				fc.array(minor),
				(count, prices, total, marks) => {
					const guards = evaluateGuards({
						assigneeCount: count,
						unitPricesMinor: prices,
						totalMinor: total,
						paymentMarksMinor: marks
					});
					return (
						GUARD_CODES.every((code) => typeof guards[code] === 'boolean') &&
						guards.hasAssignee === count > 0
					);
				}
			)
		);
	});
});
