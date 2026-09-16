import type { StreamMessage } from '$lib/types/stream';

export type CharityMessage = Extract<StreamMessage, { topic: 'charity' }>;

function isCount(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Reads one event of `/api/stream/charity`. A hand check instead of a Zod schema keeps the parser
 * out of the home page bundle; anything unexpected is dropped and the banner keeps its numbers.
 */
export function parseCharityMessage(data: string): CharityMessage | null {
	let value: unknown;
	try {
		value = JSON.parse(data);
	} catch {
		return null;
	}
	if (typeof value !== 'object' || value === null) return null;
	const message = value as Record<string, unknown>;
	if (message.topic !== 'charity') return null;
	const { totalMinor, yearMinor, requestCount } = message;
	if (!isCount(totalMinor) || !isCount(yearMinor) || !isCount(requestCount)) return null;
	return { topic: 'charity', totalMinor, yearMinor, requestCount };
}
