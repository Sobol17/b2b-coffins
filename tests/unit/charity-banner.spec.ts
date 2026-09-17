import { eq } from 'drizzle-orm';
import pino from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';
import { CharityBannerService } from '../../src/lib/server/charity/charity-banner.service';
import { ForbiddenError } from '../../src/lib/server/core/errors';
import { charityTotals, settings } from '../../src/lib/server/db/schema';
import { charityRecountHandler } from '../../src/lib/server/queue/handlers/charity-recount';
import { RequestCardService } from '../../src/lib/server/request/request-card.service';
import { charityOf, recountJobs, seedCharityWorld } from './helpers/charity';
import { migratedDatabase } from './helpers/db';
import { resetRequests } from './helpers/portal-requests';

const db = migratedDatabase();
const { actors, sent, drive } = seedCharityWorld(db);
const ctx = { jobId: 1, attempt: 1, now: new Date(), logger: pino({ level: 'silent' }) };
const fund = db.select().from(settings).where(eq(settings.key, 'charity.fund')).all()[0]?.value;

async function recountAll(): Promise<void> {
	for (const job of recountJobs(db)) await charityRecountHandler.run(job.payload, ctx);
}

/** Every key of a value, nested ones included, the way the e2e check reads a response body. */
function moneyKeys(value: unknown): string[] {
	const keys = JSON.stringify(value).match(/"[A-Za-z]*Minor"/g) ?? [];
	return keys.map((key) => key.slice(1, -1));
}

beforeEach(() => {
	resetRequests(db);
	db.delete(charityTotals).run();
	db.update(settings).set({ value: fund }).where(eq(settings.key, 'charity.fund')).run();
});

describe('charity banner (P8)', () => {
	it('shows the fund, the public counter and the own contribution to the admin', async () => {
		const mine = sent();
		drive(mine, 'delivered');
		const foreign = sent(actors.outsider, 3);
		drive(foreign, 'delivered');
		await recountAll();
		const own = charityOf(db, mine).amountMinor ?? 0;
		const all = own + (charityOf(db, foreign).amountMinor ?? 0);

		expect(new CharityBannerService(actors.admin).banner()).toEqual({
			fundTitle: 'Фонд помощи хосписам',
			fundUrl: 'https://example.org/fund',
			publicTotalMinor: all,
			publicYearMinor: all,
			publicRequestCount: 2,
			ownTotalMinor: own
		});
	});

	it('gives the employee the public numbers only', async () => {
		drive(sent(), 'delivered');
		await recountAll();

		const banner = new CharityBannerService(actors.employee).banner();
		expect(banner).not.toHaveProperty('ownTotalMinor');
		expect(moneyKeys(banner).every((key) => key.startsWith('public'))).toBe(true);
	});

	it('shows zeros before the first delivery', () => {
		expect(new CharityBannerService(actors.admin).banner()).toMatchObject({
			publicTotalMinor: 0,
			publicYearMinor: 0,
			publicRequestCount: 0,
			ownTotalMinor: 0
		});
	});

	it('draws nothing while the workshop has no fund', () => {
		db.update(settings).set({ value: {} }).where(eq(settings.key, 'charity.fund')).run();
		expect(new CharityBannerService(actors.admin).banner()).toBeNull();
	});

	it('belongs to the portal contour', () => {
		expect(() => new CharityBannerService(actors.manager).banner()).toThrow(ForbiddenError);
	});
});

describe('donation line of the request card (P8)', () => {
	it('shows the frozen amount to the admin once the request is delivered', () => {
		const id = sent();
		drive(id, 'delivered');

		expect(new RequestCardService(actors.admin).card(id).charityAmountMinor).toBe(
			charityOf(db, id).amountMinor
		);
	});

	it('has no line before delivery', () => {
		const id = sent();
		drive(id, 'ready');

		expect(new RequestCardService(actors.admin).card(id)).not.toHaveProperty('charityAmountMinor');
	});

	it('never gives the line to the employee', () => {
		const id = sent(actors.employee);
		drive(id, 'delivered');

		const card = new RequestCardService(actors.employee).card(id);
		expect(card).not.toHaveProperty('charityAmountMinor');
		expect(moneyKeys(card).filter((key) => !key.startsWith('agency'))).toEqual([]);
	});

	it('keeps the frozen amount of another counterparty out of reach', () => {
		const id = sent(actors.outsider);
		drive(id, 'delivered');

		expect(() => new RequestCardService(actors.admin).card(id)).toThrow(ForbiddenError);
	});
});
