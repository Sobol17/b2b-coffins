import { isNotNull, lt, or } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { passwordResetTokens, sessions } from '../db/schema';

export interface PurgeResult {
	readonly sessions: number;
	readonly resetTokens: number;
}

export class SessionCleanupRepository extends BaseRepository<typeof sessions> {
	constructor() {
		super(sessions);
	}

	/** Deletes by condition, not by id list: a second run finds nothing and changes nothing. */
	purgeExpired(now: Date, tx?: Tx): PurgeResult {
		const removedSessions = this.db(tx).delete(sessions).where(lt(sessions.expiresAt, now)).run();
		const removedTokens = this.db(tx)
			.delete(passwordResetTokens)
			.where(or(lt(passwordResetTokens.expiresAt, now), isNotNull(passwordResetTokens.usedAt)))
			.run();
		return { sessions: removedSessions.changes, resetTokens: removedTokens.changes };
	}
}
