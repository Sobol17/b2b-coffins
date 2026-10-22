import type { SupportSide, SupportThreadStatus } from '$lib/types/support';

/** Whose turn it is to answer: the side that did not write last, nobody once the thread is closed. */
export function awaitingSide(
	status: SupportThreadStatus,
	lastMessageSide: SupportSide
): SupportSide | null {
	if (status === 'closed') return null;
	return lastMessageSide === 'portal' ? 'crm' : 'portal';
}
