import { beforeEach, describe, expect, it } from 'vitest';
import { charityTotals, requests } from '../../src/lib/server/db/schema';
import { openEventStream, streamSnapshot } from '../../src/lib/server/events/sse';
import { StreamHub } from '../../src/lib/server/events/stream';
import { insertUser, migratedDatabase } from './helpers/db';

const db = migratedDatabase();
const managerId = insertUser({
	email: 'stream@workshop.example',
	role: 'manager',
	counterpartyId: null
});

async function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
	const { value } = await reader.read();
	return new TextDecoder().decode(value);
}

beforeEach(() => {
	db.delete(charityTotals).run();
	db.delete(requests).run();
});

describe('stream hub', () => {
	it('delivers a message to every listener of its topic and to no other', () => {
		const hub = new StreamHub();
		const charity: unknown[] = [];
		const board: unknown[] = [];
		hub.subscribe('charity', (m) => charity.push(m));
		hub.subscribe('requests', (m) => board.push(m));

		const delivered = hub.publish({
			topic: 'charity',
			totalMinor: 1,
			yearMinor: 1,
			requestCount: 1
		});

		expect(delivered).toBe(1);
		expect(charity).toHaveLength(1);
		expect(board).toHaveLength(0);
	});

	it('stops delivering after unsubscribe', () => {
		const hub = new StreamHub();
		const seen: unknown[] = [];
		const unsubscribe = hub.subscribe('charity', (m) => seen.push(m));

		unsubscribe();
		hub.publish({ topic: 'charity', totalMinor: 1, yearMinor: 1, requestCount: 1 });

		expect(seen).toHaveLength(0);
		expect(hub.listenerCount('charity')).toBe(0);
	});
});

describe('snapshots', () => {
	it('reads the charity read model for all time and the current year', () => {
		db.insert(charityTotals)
			.values([
				{ scope: 'all', amountMinor: 500_00, requestCount: 4 },
				{ scope: 'year:2026', amountMinor: 120_00, requestCount: 1 }
			])
			.run();

		expect(streamSnapshot('charity', new Date('2026-09-15T00:00:00Z'))).toEqual({
			topic: 'charity',
			totalMinor: 500_00,
			yearMinor: 120_00,
			requestCount: 4
		});
	});

	it('takes the year on the workshop clock, not in UTC', () => {
		db.insert(charityTotals)
			.values([
				{ scope: 'year:2026', amountMinor: 300_00, requestCount: 2 },
				{ scope: 'year:2027', amountMinor: 0, requestCount: 0 }
			])
			.run();

		// 31 Dec 21:30 UTC is already the new year in Moscow.
		const newYearEve = new Date('2026-12-31T21:30:00Z');
		expect(streamSnapshot('charity', newYearEve, 'Europe/Moscow')).toMatchObject({ yearMinor: 0 });
		expect(streamSnapshot('charity', newYearEve, 'UTC')).toMatchObject({ yearMinor: 300_00 });
	});

	it('counts requests per status and leaves portal drafts out', () => {
		const base = { createdById: managerId, isStockRequest: true };
		db.insert(requests)
			.values([
				{ ...base, number: 'S-1', status: 'draft' },
				{ ...base, number: 'S-2', status: 'new' },
				{ ...base, number: 'S-3', status: 'new' },
				{ ...base, number: 'S-4', status: 'paid' }
			])
			.run();

		const snapshot = streamSnapshot('requests', new Date());

		expect(snapshot).toMatchObject({ topic: 'requests' });
		if (snapshot.topic !== 'requests') throw new Error('wrong topic');
		expect(snapshot.byStatus).toMatchObject({ draft: 0, new: 2, paid: 1, in_work: 0 });
	});
});

describe('event stream body', () => {
	it('sends the snapshot first, then published messages, and detaches on abort', async () => {
		const hub = new StreamHub();
		const abort = new AbortController();
		const reader = openEventStream('charity', abort.signal, hub).getReader();

		expect(await readChunk(reader)).toBe(
			'data: {"topic":"charity","totalMinor":0,"yearMinor":0,"requestCount":0}\n\n'
		);

		hub.publish({ topic: 'charity', totalMinor: 700, yearMinor: 700, requestCount: 1 });
		expect(await readChunk(reader)).toContain('"totalMinor":700');

		abort.abort();
		expect(hub.listenerCount('charity')).toBe(0);
		expect((await reader.read()).done).toBe(true);
	});

	it('survives a browser that cancels the body before the request aborts', async () => {
		const hub = new StreamHub();
		const abort = new AbortController();
		const reader = openEventStream('charity', abort.signal, hub).getReader();
		await readChunk(reader);
		const uncaught: unknown[] = [];
		const record = (err: unknown): void => void uncaught.push(err);
		process.on('uncaughtException', record);

		await reader.cancel();
		abort.abort();
		// Node rethrows a listener error on the next tick, so give it one before checking.
		await new Promise((resolve) => setImmediate(resolve));
		process.off('uncaughtException', record);

		expect(uncaught).toEqual([]);
		expect(hub.listenerCount('charity')).toBe(0);
	});
});
