import { beforeEach, describe, expect, it } from 'vitest';
import { jobQueue } from '../../src/lib/server/db/schema';
import { bus } from '../../src/lib/server/events/bus';
import { JOB_PAYLOAD_SCHEMAS } from '../../src/lib/server/queue/topics';
import { migratedDatabase } from './helpers/db';

const db = migratedDatabase();

beforeEach(() => {
	db.delete(jobQueue).run();
});

describe('event bus', () => {
	it('turns an event into one notification.fanout job with the documented key', () => {
		bus.emit('request.submitted', 12);

		const [job] = db.select().from(jobQueue).all();
		expect(job).toMatchObject({
			topic: 'notification.fanout',
			idempotencyKey: 'fanout:request.submitted:12',
			status: 'pending'
		});
		expect(JOB_PAYLOAD_SCHEMAS['notification.fanout'].parse(job?.payload)).toEqual({
			eventKey: 'request.submitted',
			entityId: 12
		});
	});

	it('does not queue a second fanout for the same event and entity', () => {
		bus.emit('request.ready', 5);
		bus.emit('request.ready', 5);

		expect(db.select().from(jobQueue).all()).toHaveLength(1);
	});

	it('publishes nothing when the transaction that emitted the event rolls back', () => {
		expect(() =>
			db.transaction((tx) => {
				bus.emit('request.paid', 9, tx);
				throw new Error('payment mark rejected');
			})
		).toThrow('payment mark rejected');

		expect(db.select().from(jobQueue).all()).toHaveLength(0);
	});
});
