import { and, eq, gt, isNull, sql, ne } from 'drizzle-orm';
import { database, type Tx } from '../db/client';
import { passwordResetTokens, users } from '../db/schema';

export type UserRow = typeof users.$inferSelect;

/** Data access only. It never decides whether a login is allowed. */
export class AuthRepository {
	findByEmail(email: string): UserRow | undefined {
		const [row] = database
			.select()
			.from(users)
			.where(and(eq(sql`lower(${users.email})`, email), isNull(users.deletedAt)))
			.all();
		return row;
	}

	findByPhone(phone: string): UserRow | undefined {
		return database
			.select()
			.from(users)
			.where(and(eq(users.phone, phone), isNull(users.deletedAt)))
			.get();
	}

	phoneTaken(phone: string, tx?: Tx, exceptId?: number): boolean {
		return (
			(tx ?? database)
				.select({ id: users.id })
				.from(users)
				.where(
					and(
						eq(users.phone, phone),
						isNull(users.deletedAt),
						exceptId === undefined ? undefined : ne(users.id, exceptId)
					)
				)
				.get() !== undefined
		);
	}

	findById(id: number): UserRow | undefined {
		const [row] = database.select().from(users).where(eq(users.id, id)).all();
		return row;
	}

	recordFailure(id: number, failedAttempts: number, lockedUntil: Date | null): void {
		database.update(users).set({ failedAttempts, lockedUntil }).where(eq(users.id, id)).run();
	}

	recordSuccess(id: number): void {
		database
			.update(users)
			.set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() })
			.where(eq(users.id, id))
			.run();
	}

	setPassword(id: number, passwordHash: string, tx?: Tx): void {
		(tx ?? database)
			.update(users)
			.set({ passwordHash, mustChangePassword: false, failedAttempts: 0, lockedUntil: null })
			.where(eq(users.id, id))
			.run();
	}

	createResetToken(userId: number, tokenHash: string, expiresAt: Date): void {
		database.insert(passwordResetTokens).values({ userId, tokenHash, expiresAt }).run();
	}

	findUsableResetToken(tokenHash: string) {
		const [row] = database
			.select()
			.from(passwordResetTokens)
			.where(
				and(
					eq(passwordResetTokens.tokenHash, tokenHash),
					isNull(passwordResetTokens.usedAt),
					gt(passwordResetTokens.expiresAt, new Date())
				)
			)
			.all();
		return row;
	}

	markResetTokenUsed(id: number, tx?: Tx): void {
		(tx ?? database)
			.update(passwordResetTokens)
			.set({ usedAt: new Date() })
			.where(eq(passwordResetTokens.id, id))
			.run();
	}
}
