import { expect } from '@playwright/test';
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../src/lib/server/db/client';
import {
	charityTotals,
	jobQueue,
	requestAssignees,
	requests,
	settings,
	users
} from '../../src/lib/server/db/schema';
import { ACCOUNTS } from './fixtures';

export function charityAmountOf(db: Db, number: string): number | null {
	const [row] = db
		.select({ amount: requests.charityAmountMinor })
		.from(requests)
		.where(eq(requests.number, number))
		.all();
	if (!row) throw new Error(`request ${number} not found`);
	return row.amount;
}

export function totalOf(db: Db, number: string): number {
	const [row] = db
		.select({ total: requests.totalMinor })
		.from(requests)
		.where(eq(requests.number, number))
		.all();
	return row?.total ?? 0;
}

/**
 * The fund total once the preview worker has run every queued recount. Reading it earlier would
 * compare the banner with a number the server has not published yet.
 */
export async function settledFundTotal(db: Db): Promise<number> {
	await expect
		.poll(
			() =>
				db
					.select({ id: jobQueue.id })
					.from(jobQueue)
					.where(
						and(
							eq(jobQueue.topic, 'charity.recount'),
							inArray(jobQueue.status, ['pending', 'running'])
						)
					)
					.all().length,
			{ timeout: 15_000 }
		)
		.toBe(0);
	const [row] = db
		.select({ amount: charityTotals.amountMinor })
		.from(charityTotals)
		.where(eq(charityTotals.scope, 'all'))
		.all();
	return row?.amount ?? 0;
}

/** The workshop edits the rate in C1; until then the suite writes the setting directly. */
export function setCharityRate(db: Db, rateBp: number): void {
	db.update(settings).set({ value: rateBp }).where(eq(settings.key, 'charity.rate_bp')).run();
}

/** Stock requests are created in C4; the suite writes one that is ready for the driver. */
export function insertReadyStockRequest(db: Db): string {
	const number = `С-E2E-${Date.now()}`;
	const manager = userId(db, ACCOUNTS.manager.email);
	const [created] = db
		.insert(requests)
		.values({
			number,
			counterpartyId: null,
			isStockRequest: true,
			createdById: manager,
			status: 'ready',
			totalMinor: 1_000_000,
			itemsTotalMinor: 1_000_000,
			submittedAt: new Date(),
			readyAt: new Date()
		})
		.returning({ id: requests.id })
		.all();
	if (!created) throw new Error('failed to insert a stock request');
	db.insert(requestAssignees)
		.values({ requestId: created.id, userId: userId(db, ACCOUNTS.driver.email), role: 'driver' })
		.run();
	return number;
}

function userId(db: Db, email: string): number {
	const [row] = db.select({ id: users.id }).from(users).where(eq(users.email, email)).all();
	if (!row) throw new Error(`user ${email} not found`);
	return row.id;
}
