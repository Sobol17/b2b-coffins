import pino from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';
import { CharityRepository } from '../../src/lib/server/charity/charity.repository';
import { CharityTotalsRepository } from '../../src/lib/server/charity/charity-totals.repository';
import { charityTotals } from '../../src/lib/server/db/schema';
import { StreamHub } from '../../src/lib/server/events/stream';
import { backoffSeconds } from '../../src/lib/server/queue/backoff';
import { InvalidPayloadError } from '../../src/lib/server/queue/job-handler';
import {
	createCharityRecountHandler,
	type CharityRecountDeps
} from '../../src/lib/server/queue/handlers/charity-recount';
import { Worker } from '../../src/lib/server/queue/worker';
import type { StreamMessage } from '../../src/lib/types/stream';
import { charityOf, recountJobs, seedCharityWorld, totalsRow } from './helpers/charity';
import { migratedDatabase } from './helpers/db';
import { resetRequests } from './helpers/portal-requests';
import { move } from './helpers/transitions';

const db = migratedDatabase();
const { world, actors, sent, drive } = seedCharityWorld(db);
const now = new Date();
const year = `year:${new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric' }).format(now)}`;
const ctx = { jobId: 1, attempt: 1, now, logger: pino({ level: 'silent' }) };

let hub: StreamHub;
let published: StreamMessage[];

function deps(overrides: Partial<CharityRecountDeps> = {}): CharityRecountDeps {
	return {
		requests: new CharityRepository(),
		totals: new CharityTotalsRepository(),
		hub,
		timeZone: () => 'Europe/Moscow',
		...overrides
	};
}

// The real clock by default: `visible_at` is stored in whole seconds at enqueue time, so a clock
// frozen at module load misses every job queued in a later second.
function worker(handlerDeps: CharityRecountDeps, clock: () => Date = () => new Date()): Worker {
	return new Worker({ handlers: [createCharityRecountHandler(handlerDeps)], clock });
}

function amountOf(id: number): number {
	return charityOf(db, id).amountMinor ?? 0;
}

beforeEach(() => {
	resetRequests(db);
	db.delete(charityTotals).run();
	hub = new StreamHub();
	published = [];
	hub.subscribe('charity', (message) => published.push(message));
});

describe('charity.recount (P8)', () => {
	it('rebuilds the fund, the year and the counterparty from delivered requests', async () => {
		const mine = sent();
		drive(mine, 'delivered');
		const foreign = sent(actors.outsider, 3);
		drive(foreign, 'delivered');

		await worker(deps()).drain();

		const both = amountOf(mine) + amountOf(foreign);
		expect(totalsRow(db, 'all')).toEqual([{ amountMinor: both, requestCount: 2 }]);
		expect(totalsRow(db, year)).toEqual([{ amountMinor: both, requestCount: 2 }]);
		expect(totalsRow(db, `cp:${world.cpId}`)).toEqual([
			{ amountMinor: amountOf(mine), requestCount: 1 }
		]);
		expect(recountJobs(db).every((job) => job.status === 'done')).toBe(true);
	});

	it('pushes the public numbers to the charity stream', async () => {
		const id = sent();
		drive(id, 'delivered');

		await worker(deps()).drain();

		expect(published.at(-1)).toEqual({
			topic: 'charity',
			totalMinor: amountOf(id),
			yearMinor: amountOf(id),
			requestCount: 1
		});
		// The fund and the year go out; the private counterparty row stays off the public stream.
		expect(published).toHaveLength(2);
	});

	it('gives one effect when the same recount runs twice', async () => {
		const id = sent();
		drive(id, 'delivered');
		const handler = createCharityRecountHandler(deps());

		await handler.run({ scope: 'all' }, ctx);
		await handler.run({ scope: 'all' }, ctx);

		expect(totalsRow(db, 'all')).toEqual([{ amountMinor: amountOf(id), requestCount: 1 }]);
		expect(db.select().from(charityTotals).all()).toHaveLength(1);
	});

	it('leaves cancelled requests and undelivered ones out of the counter', async () => {
		const delivered = sent();
		drive(delivered, 'delivered');
		const cancelled = sent();
		move(actors.admin, cancelled, 'cancelled');
		drive(sent(), 'ready');

		await worker(deps()).drain();

		expect(totalsRow(db, 'all')).toEqual([{ amountMinor: amountOf(delivered), requestCount: 1 }]);
	});

	it('refuses an unknown scope as a payload no retry can fix', async () => {
		const handler = createCharityRecountHandler(deps());

		await expect(handler.run({ scope: 'cp:abc' }, ctx)).rejects.toBeInstanceOf(InvalidPayloadError);
		expect(db.select().from(charityTotals).all()).toEqual([]);
	});

	it('retries a failing rebuild with backoff, then gives up as dead with no partial row', async () => {
		drive(sent(), 'delivered');
		const broken = new CharityTotalsRepository();
		broken.put = () => {
			throw new Error('disk I/O error');
		};
		let offsetMs = 0;
		const run = worker(deps({ totals: broken }), () => new Date(Date.now() + offsetMs));

		await run.drain();
		const [first] = recountJobs(db);
		expect(first?.status).toBe('pending');

		for (let attempt = 1; attempt < 5; attempt += 1) {
			offsetMs += backoffSeconds(attempt) * 1000;
			await run.drain();
		}

		expect(recountJobs(db).map((job) => job.status)).toEqual(['dead', 'dead', 'dead']);
		expect(db.select().from(charityTotals).all()).toEqual([]);
		expect(published).toEqual([]);
	});
});
