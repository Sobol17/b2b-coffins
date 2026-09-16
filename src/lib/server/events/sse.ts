import { CharityTotalsRepository } from '../charity/charity-totals.repository';
import { RequestStatsRepository } from '../request/request-stats.repository';
import { OrgService } from '../settings/org.service';
import { streamHub, type StreamHub, type StreamTopic } from './stream';
import { formatCharityScope, yearInZone } from '$lib/domain/charity/rate';
import type { StreamMessage } from '$lib/types/stream';

const HEARTBEAT_MS = 15_000;

/** Current state of a topic, sent first so a fresh connection never waits for the next change. */
export function streamSnapshot(
	topic: StreamTopic,
	now: Date,
	timeZone: string = OrgService.timezone()
): StreamMessage {
	if (topic === 'requests') {
		return { topic, byStatus: new RequestStatsRepository().countByStatus() };
	}
	const totals = new CharityTotalsRepository();
	const all = totals.findByScope('all');
	// The year of the banner is the year on the workshop's wall clock, as in the recount job.
	const year = totals.findByScope(
		formatCharityScope({ kind: 'year', year: yearInZone(now, timeZone) })
	);
	return {
		topic,
		totalMinor: all?.amountMinor ?? 0,
		yearMinor: year?.amountMinor ?? 0,
		requestCount: all?.requestCount ?? 0
	};
}

export function encodeMessage(message: StreamMessage): string {
	return `data: ${JSON.stringify(message)}\n\n`;
}

/** SSE body: snapshot, then every published message, a comment heartbeat, cleanup on disconnect. */
export function openEventStream(
	topic: StreamTopic,
	signal: AbortSignal,
	hub: StreamHub = streamHub
): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	let close = (): void => {};

	return new ReadableStream<Uint8Array>({
		start(controller) {
			let closed = false;
			const write = (chunk: string): void => {
				if (!closed) controller.enqueue(encoder.encode(chunk));
			};
			write(encodeMessage(streamSnapshot(topic, new Date())));
			const unsubscribe = hub.subscribe(topic, (message) => write(encodeMessage(message)));
			// Proxies drop a silent connection; a comment line keeps it open and is ignored by EventSource.
			const heartbeat = setInterval(() => write(': ping\n\n'), HEARTBEAT_MS);

			close = () => {
				if (closed) return;
				closed = true;
				clearInterval(heartbeat);
				unsubscribe();
			};
			signal.addEventListener(
				'abort',
				() => {
					// The browser usually cancels the body before the request signal aborts. Closing an
					// already cancelled controller throws outside any handler and takes the process down.
					if (closed) return;
					close();
					controller.close();
				},
				{ once: true }
			);
		},
		cancel() {
			close();
		}
	});
}
