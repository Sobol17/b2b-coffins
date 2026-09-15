import type { Tx } from '../db/client';
import { Queue } from '../queue/queue';
import { jobKey } from '../queue/topics';
import type { EventKey } from '$lib/types/events';

/**
 * Domain events of tech.md 7.3. Emitting only queues `notification.fanout` inside the caller's
 * transaction; nothing is sent from here, so a rolled-back change never notifies anyone.
 */
export class EventBus {
	static emit(eventKey: EventKey, entityId: number, tx?: Tx): void {
		Queue.enqueue(
			'notification.fanout',
			{ eventKey, entityId },
			jobKey.fanout(eventKey, entityId),
			tx
		);
	}
}

export const bus = EventBus;
