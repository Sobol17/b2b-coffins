import type { RoleCode } from '$lib/types/roles';
import type { SupportSide } from '$lib/types/support';

/** The CRM roles that hold `support.any` and answer threads. */
const WORKSHOP_HEADS: ReadonlySet<RoleCode> = new Set(['manager', 'owner']);

export interface SupportCandidate {
	readonly userId: number;
	readonly side: SupportSide;
	readonly roles: readonly RoleCode[];
}

/** Who did something in a thread, and whose thread it is. */
export interface SupportAct {
	readonly actorId: number;
	readonly actorSide: SupportSide;
	readonly threadAuthorId: number;
}

/**
 * People an act in a support thread is told to (tech.md 7.3, v1.57). The act goes to the other
 * side; on the portal side only the counterparty administrators and the author of the thread hear
 * of it. The actor is never told about their own message, unlike every other event.
 */
export function supportRecipients<C extends SupportCandidate>(
	act: SupportAct,
	candidates: readonly C[]
): C[] {
	return candidates.filter((candidate) => {
		if (candidate.userId === act.actorId) return false;
		// An administrator writing in an employee's thread: the employee must still learn of it.
		// Only the portal opens threads, so only a portal person can be that author.
		if (candidate.side === act.actorSide) {
			return candidate.side === 'portal' && candidate.userId === act.threadAuthorId;
		}
		// The fence lives here, not in the rule matrix: a stray rule row must not leak the text.
		if (candidate.side === 'crm') return candidate.roles.some((role) => WORKSHOP_HEADS.has(role));
		return candidate.roles.includes('cp_admin') || candidate.userId === act.threadAuthorId;
	});
}
