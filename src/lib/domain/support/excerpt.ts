import { SUPPORT_EXCERPT_MAX } from '$lib/types/support';

const ELLIPSIS = '…';

/**
 * The start of a message for a push body: whitespace collapsed, cut at a word boundary when one
 * sits in the second half, so the lock screen does not show half a word.
 */
export function excerpt(text: string, max: number = SUPPORT_EXCERPT_MAX): string {
	const flat = text.replace(/\s+/g, ' ').trim();
	if (flat.length <= max) return flat;
	const head = flat.slice(0, max - ELLIPSIS.length);
	const space = head.lastIndexOf(' ');
	const cut = space > max / 2 ? head.slice(0, space) : head;
	return cut.trimEnd() + ELLIPSIS;
}
