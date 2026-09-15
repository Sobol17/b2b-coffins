import type { StreamMessage } from '$lib/types/stream';

export type StreamTopic = StreamMessage['topic'];
export const STREAM_TOPICS = ['charity', 'requests'] as const satisfies readonly StreamTopic[];

type Listener = (message: StreamMessage) => void;

/**
 * In-process fan-out behind /api/stream/:topic. It holds open connections per topic and nothing
 * about the viewer: charity is public and requests carries counters only (tech.md 7.4). Access is
 * decided in the route before a listener is attached.
 */
export class StreamHub {
	private readonly listeners = new Map<StreamTopic, Set<Listener>>();

	subscribe(topic: StreamTopic, listener: Listener): () => void {
		const set = this.listeners.get(topic) ?? new Set<Listener>();
		set.add(listener);
		this.listeners.set(topic, set);
		return () => set.delete(listener);
	}

	/** @returns how many open connections received the message. */
	publish(message: StreamMessage): number {
		const set = this.listeners.get(message.topic);
		if (!set) return 0;
		for (const listener of set) listener(message);
		return set.size;
	}

	listenerCount(topic: StreamTopic): number {
		return this.listeners.get(topic)?.size ?? 0;
	}
}

export const streamHub = new StreamHub();
