import { TRANSITIONS, type TransitionDenial } from './state-machine';
import type { RequestStatus, Transition } from '$lib/types/request';

/** The moment column a request stamps when it enters a status. Other statuses carry no moment. */
export const STATUS_STAMPS = {
	new: 'submittedAt',
	in_work: 'acceptedAt',
	ready: 'readyAt',
	delivered: 'deliveredAt',
	paid: 'paidAt'
} as const satisfies Partial<Record<RequestStatus, string>>;

export type StampField = (typeof STATUS_STAMPS)[keyof typeof STATUS_STAMPS];

export function stampFor(status: RequestStatus): StampField | undefined {
	return (STATUS_STAMPS as Partial<Record<RequestStatus, StampField>>)[status];
}

/**
 * The automatic step that follows entering `status`, if the table has one. The system takes it in
 * the transaction of the manual move and only when its guards hold, so a delivery that collected
 * the cash runs on to `paid` while a delivery billed by invoice stops at `awaiting_payment`.
 */
export function autoTransition(status: RequestStatus): Transition | undefined {
	return TRANSITIONS.find((t) => t.from === status && t.auto === true);
}

export function autoFollowUp(status: RequestStatus): RequestStatus | undefined {
	return autoTransition(status)?.to;
}

export type DenialKind = 'conflict' | 'forbidden' | 'validation';

/**
 * How a refused move surfaces: the request is not in a state that allows it (conflict, 409), the
 * actor has no right to it (forbidden, 403), or the input lacks a reason (validation, 422).
 */
export function denialKind(denial: TransitionDenial): DenialKind {
	switch (denial.code) {
		case 'unknown_transition':
		case 'guard_failed':
			return 'conflict';
		case 'reason_required':
			return 'validation';
		case 'role_not_allowed':
		case 'not_owner':
		case 'not_assigned':
			return 'forbidden';
	}
}
