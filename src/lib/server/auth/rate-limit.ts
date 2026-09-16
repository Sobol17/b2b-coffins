import { eq } from 'drizzle-orm';
import { database } from '../db/client';
import { rateLimits } from '../db/schema';
import { RateLimitError } from '../core/errors';

export interface RateLimitRule {
	readonly limit: number;
	readonly windowSec: number;
	readonly blockSec: number;
}

export const RATE_LIMITS = {
	login: { limit: 10, windowSec: 300, blockSec: 900 },
	'password.reset': { limit: 5, windowSec: 900, blockSec: 900 },
	'password.change': { limit: 10, windowSec: 900, blockSec: 900 },
	// Creating an account sends a mail with a password: a runaway form must not spam mailboxes.
	'staff.create': { limit: 20, windowSec: 3600, blockSec: 3600 },
	// Every sent request lands on the manager's board and notifies people (tech.md 12).
	'request.submit': { limit: 30, windowSec: 3600, blockSec: 900 },
	// A thread the manager reads, so a runaway form must not bury the real messages.
	'request.comment': { limit: 60, windowSec: 3600, blockSec: 900 },
	// An upload writes to disk: the budget is what keeps the files directory from filling up.
	'file.upload': { limit: 40, windowSec: 3600, blockSec: 900 }
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitAction = keyof typeof RATE_LIMITS;

/**
 * Counter lives in SQLite rather than in memory: the app runs as one process today, but a
 * restart must not hand an attacker a fresh budget.
 */
export function consumeRateLimit(action: RateLimitAction, subject: string): void {
	const rule = RATE_LIMITS[action];
	const key = `${action}:${subject}`;
	const now = new Date();

	database.transaction((tx) => {
		const [row] = tx.select().from(rateLimits).where(eq(rateLimits.key, key)).all();

		if (row?.blockedUntil && row.blockedUntil > now) {
			throw new RateLimitError(
				action,
				Math.ceil((row.blockedUntil.getTime() - now.getTime()) / 1000)
			);
		}

		const windowExpired = !row || now.getTime() - row.windowStart.getTime() > rule.windowSec * 1000;
		if (windowExpired) {
			tx.insert(rateLimits)
				.values({ key, hits: 1, windowStart: now, blockedUntil: null })
				.onConflictDoUpdate({
					target: rateLimits.key,
					set: { hits: 1, windowStart: now, blockedUntil: null }
				})
				.run();
			return;
		}

		const hits = row.hits + 1;
		const blockedUntil = hits > rule.limit ? new Date(now.getTime() + rule.blockSec * 1000) : null;
		tx.update(rateLimits).set({ hits, blockedUntil }).where(eq(rateLimits.key, key)).run();

		if (blockedUntil) throw new RateLimitError(action, rule.blockSec);
	});
}

/** Called after a success so a legitimate user is not punished for earlier typos. */
export function resetRateLimit(action: RateLimitAction, subject: string): void {
	database
		.delete(rateLimits)
		.where(eq(rateLimits.key, `${action}:${subject}`))
		.run();
}
