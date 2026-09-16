import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { requests } from '../../src/lib/server/db/schema';
import { JOB_PAYLOAD_SCHEMAS } from '../../src/lib/server/queue/topics';
import { charityOf, recountJobs, seedCharityWorld, setRate } from './helpers/charity';
import { migratedDatabase } from './helpers/db';
import { resetRequests } from './helpers/portal-requests';
import { move, refused, statusOf } from './helpers/transitions';

const db = migratedDatabase();
const { world, actors, sent, drive } = seedCharityWorld(db);
const year = new Intl.DateTimeFormat('en-CA', {
	timeZone: 'Europe/Moscow',
	year: 'numeric'
}).format(new Date());

beforeEach(() => {
	resetRequests(db);
	setRate(db, 100);
});

describe('charity freeze on delivery (P8)', () => {
	it('fixes the rate and the amount of the request total at delivered', () => {
		const id = sent();
		drive(id, 'delivered');

		const row = charityOf(db, id);
		expect(row.totalMinor).toBeGreaterThan(0);
		expect(row.rateBp).toBe(100);
		expect(row.amountMinor).toBe(Math.round(row.totalMinor / 100));
	});

	it('leaves the donation empty before delivery', () => {
		const id = sent();
		drive(id, 'ready');

		expect(charityOf(db, id)).toMatchObject({ rateBp: null, amountMinor: null });
		expect(recountJobs(db)).toEqual([]);
	});

	it('does not move a fixed amount when the rate changes later', () => {
		const first = sent();
		drive(first, 'delivered');
		const frozen = charityOf(db, first);

		setRate(db, 500);
		const second = sent();
		drive(second, 'delivered');

		expect(charityOf(db, first)).toEqual(frozen);
		expect(charityOf(db, second).rateBp).toBe(500);
		expect(charityOf(db, second).amountMinor).toBe(
			Math.round(charityOf(db, second).totalMinor / 20)
		);
	});

	it('does not move a fixed amount when the prices change later', () => {
		const id = sent();
		drive(id, 'delivered');
		const frozen = charityOf(db, id).amountMinor;

		db.update(requests).set({ totalMinor: 1 }).where(eq(requests.id, id)).run();
		expect(charityOf(db, id).amountMinor).toBe(frozen);
	});

	it('queues one recount per scope, keyed by the request, in the shape of tech.md 7.2', () => {
		const id = sent();
		drive(id, 'delivered');

		const jobs = recountJobs(db);
		expect(jobs.map((job) => job.key)).toEqual([
			`charity:all:${id}`,
			`charity:year:${year}:${id}`,
			`charity:cp:${world.cpId}:${id}`
		]);
		for (const job of jobs) {
			expect(JOB_PAYLOAD_SCHEMAS['charity.recount'].safeParse(job.payload).success).toBe(true);
		}
	});

	it('queues a fresh recount for a second delivery in the same hour', () => {
		const first = sent();
		drive(first, 'delivered');
		const second = sent();
		drive(second, 'delivered');

		expect(recountJobs(db).filter((job) => job.key.startsWith('charity:all:'))).toHaveLength(2);
	});

	it('gives a cancelled request nothing', () => {
		const id = sent();
		move(actors.admin, id, 'cancelled');

		expect(charityOf(db, id)).toMatchObject({ status: 'cancelled', amountMinor: null });
		expect(recountJobs(db)).toEqual([]);
	});

	it('gives a stock request nothing (invariant 6)', () => {
		const id = sent();
		db.update(requests)
			.set({ isStockRequest: true, counterpartyId: null })
			.where(eq(requests.id, id))
			.run();
		drive(id, 'delivered');

		expect(statusOf(id)).toBe('awaiting_payment');
		expect(charityOf(db, id)).toMatchObject({ rateBp: null, amountMinor: null });
		expect(recountJobs(db)).toEqual([]);
	});

	it('refuses the delivery and keeps the status when the rate is broken', () => {
		const id = sent();
		drive(id, 'ready');
		setRate(db, 'one percent');

		expect(refused(() => move(actors.driver, id, 'delivered')).status).toBe(500);
		expect(statusOf(id)).toBe('ready');
		expect(charityOf(db, id).amountMinor).toBeNull();
		expect(recountJobs(db)).toEqual([]);
	});
});
