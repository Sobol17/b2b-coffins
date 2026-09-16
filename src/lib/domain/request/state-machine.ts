import type { RoleCode } from '$lib/types/roles';
import type { GuardCode, RequestStatus, Transition } from '$lib/types/request';

/**
 * The only source of truth about request transitions. The server checks a move through it and the
 * UI decides which buttons to draw through it. Duplicating a rule in a component is forbidden.
 */
export const TRANSITIONS: readonly Transition[] = [
	{
		from: 'draft',
		to: 'new',
		roles: ['cp_admin', 'cp_employee', 'manager', 'owner'],
		ownOnly: true
	},
	{
		from: 'new',
		to: 'in_work',
		roles: ['manager', 'owner'],
		guards: ['hasAssignee', 'pricesFixed'],
		effects: ['audit']
	},
	{
		from: 'new',
		to: 'cancelled',
		roles: ['cp_admin', 'cp_employee', 'manager', 'owner'],
		ownOnly: true
	},
	{ from: 'new', to: 'rejected', roles: ['manager', 'owner'], requiresReason: true },
	{
		from: 'in_work',
		to: 'ready',
		roles: ['carpenter', 'painter', 'manager', 'owner'],
		assignedOnly: true,
		guards: ['hasAssignee'],
		effects: ['consumeComponents', 'produceStockItems', 'emit:request.ready']
	},
	{
		from: 'ready',
		to: 'delivered',
		roles: ['driver', 'manager', 'owner'],
		assignedOnly: true,
		effects: ['shipStockItems', 'freezeCharity', 'emit:request.delivered']
	},
	{ from: 'delivered', to: 'awaiting_payment', roles: ['system'], auto: true },
	{
		from: 'awaiting_payment',
		to: 'paid',
		roles: ['system'],
		auto: true,
		guards: ['fullyPaid'],
		effects: ['emit:request.paid']
	}
] as const;

export type ActorRole = RoleCode | 'system';

export type TransitionDenial =
	| { code: 'unknown_transition' }
	| { code: 'role_not_allowed' }
	| { code: 'not_owner' }
	| { code: 'not_assigned' }
	| { code: 'reason_required' }
	| { code: 'guard_failed'; guard: GuardCode };

export type TransitionCheck =
	{ ok: true; transition: Transition } | { ok: false; denial: TransitionDenial };

export interface TransitionInput {
	readonly from: RequestStatus;
	readonly to: RequestStatus;
	readonly actorRoles: readonly ActorRole[];
	/** Portal actor owns the request, or a CRM actor for whom ownOnly does not apply. */
	readonly isOwnRequest: boolean;
	readonly isAssigned: boolean;
	readonly hasReason: boolean;
	readonly guards: Readonly<Partial<Record<GuardCode, boolean>>>;
}

export function findTransition(from: RequestStatus, to: RequestStatus): Transition | undefined {
	return TRANSITIONS.find((t) => t.from === from && t.to === to);
}

export function checkTransition(input: TransitionInput): TransitionCheck {
	const transition = findTransition(input.from, input.to);
	if (!transition) return { ok: false, denial: { code: 'unknown_transition' } };

	if (!input.actorRoles.some((role) => transition.roles.includes(role))) {
		return { ok: false, denial: { code: 'role_not_allowed' } };
	}
	if (transition.ownOnly && !input.isOwnRequest) {
		return { ok: false, denial: { code: 'not_owner' } };
	}
	if (transition.assignedOnly && !input.isAssigned) {
		return { ok: false, denial: { code: 'not_assigned' } };
	}
	if (transition.requiresReason && !input.hasReason) {
		return { ok: false, denial: { code: 'reason_required' } };
	}
	for (const guard of transition.guards ?? []) {
		if (input.guards[guard] !== true) return { ok: false, denial: { code: 'guard_failed', guard } };
	}
	return { ok: true, transition };
}

/** Targets the actor may reach from `from`, ignoring guards. Used to draw buttons, not to allow. */
export function targetsForRole(from: RequestStatus, roles: readonly ActorRole[]): RequestStatus[] {
	return TRANSITIONS.filter(
		(t) => t.from === from && t.roles.some((role) => roles.includes(role))
	).map((t) => t.to);
}

export const TERMINAL_STATUSES: readonly RequestStatus[] = ['paid', 'cancelled', 'rejected'];

export function isTerminal(status: RequestStatus): boolean {
	return TERMINAL_STATUSES.includes(status);
}
