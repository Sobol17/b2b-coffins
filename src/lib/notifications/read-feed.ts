import type { ResolvedPathname } from '$app/types';

/**
 * Marks the feed rows the reader has just seen and answers with what is left unread, or null when
 * the call failed: a bell that cannot reach the server keeps its counter instead of lying about it.
 */
export async function markFeedRead(
	url: ResolvedPathname,
	ids: readonly number[]
): Promise<number | null> {
	if (ids.length === 0) return null;
	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'x-requested-with': 'fetch' },
			body: JSON.stringify({ ids })
		});
		if (!response.ok) return null;
		const body: unknown = await response.json();
		const unread =
			typeof body === 'object' && body !== null ? (body as { unread?: unknown }).unread : null;
		return typeof unread === 'number' ? unread : null;
	} catch {
		return null;
	}
}
