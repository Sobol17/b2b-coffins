import pino from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';
import { jobQueue, passwordResetTokens, sessions } from '../../src/lib/server/db/schema';
import { sessionCleanupHandler } from '../../src/lib/server/queue/handlers/session-cleanup';
import { dailyCleanupScheduler } from '../../src/lib/server/queue/runtime';
import { insertUser, migratedDatabase } from './helpers/db';

const db = migratedDatabase();
const now = new Date('2026-09-15T03:00:00Z');
const hour = 3_600_000;
const userId = insertUser({
	email: 'cleanup@workshop.example',
	role: 'manager',
	counterpartyId: null
});
const ctx = { jobId: 1, attempt: 1, now, logger: pino({ level: 'silent' }) };

function seedAuthRows(): void {
	db.insert(sessions)
		.values([
			{ id: 'expired', userId, expiresAt: new Date(now.getTime() - hour) },
			{ id: 'alive', userId, expiresAt: new Date(now.getTime() + hour) }
		])
		.run();
	db.insert(passwordResetTokens)
		.values([
			{ userId, tokenHash: 'expired', expiresAt: new Date(now.getTime() - hour) },
			{ userId, tokenHash: 'used', expiresAt: new Date(now.getTime() + hour), usedAt: now },
			{ userId, tokenHash: 'usable', expiresAt: new Date(now.getTime() + hour) }
		])
		.run();
}

function snapshot() {
	return {
		sessions: db.select({ id: sessions.id }).from(sessions).all(),
		tokens: db.select({ hash: passwordResetTokens.tokenHash }).from(passwordResetTokens).all()
	};
}

beforeEach(() => {
	db.delete(sessions).run();
	db.delete(passwordResetTokens).run();
	db.delete(jobQueue).run();
});

describe('session.cleanup', () => {
	it('removes expired sessions and spent tokens and keeps live ones', async () => {
		seedAuthRows();

		await sessionCleanupHandler.run({}, ctx);

		expect(snapshot()).toEqual({ sessions: [{ id: 'alive' }], tokens: [{ hash: 'usable' }] });
	});

	it('gives exactly one effect when the same payload runs twice', async () => {
		seedAuthRows();

		await sessionCleanupHandler.run({}, ctx);
		const afterFirst = snapshot();
		await sessionCleanupHandler.run({}, ctx);

		expect(snapshot()).toEqual(afterFirst);
	});

	it('is scheduled once per UTC day however often the worker ticks', () => {
		const schedule = dailyCleanupScheduler();

		schedule(now);
		schedule(new Date(now.getTime() + 60_000));
		// A restarted process has a fresh scheduler; the idempotency key still holds.
		dailyCleanupScheduler()(now);
		schedule(new Date(now.getTime() + 24 * hour));

		const keys = db.select({ key: jobQueue.idempotencyKey }).from(jobQueue).all();
		expect(keys.map((row) => row.key).sort()).toEqual(['cleanup:20260915', 'cleanup:20260916']);
	});
});
