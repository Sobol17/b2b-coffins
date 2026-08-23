import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import { database, type Tx } from '../db/client';
import { roles, sessions, userRoles, users } from '../db/schema';
import { PolicyService } from './policy';
import type { ActorContext } from '$lib/types/actor';
import type { RoleCode } from '$lib/types/roles';

export const SESSION_COOKIE = 'sid';
export const SESSION_TTL_DAYS = 30;
const RENEW_AFTER_DAYS = 15;

export interface SessionUser {
	readonly id: number;
	readonly email: string;
	readonly fullName: string;
	readonly scope: 'portal' | 'crm';
	readonly counterpartyId: number | null;
	readonly mustChangePassword: boolean;
	readonly roles: readonly RoleCode[];
}

export interface ResolvedSession {
	readonly user: SessionUser;
	readonly expiresAt: Date;
	/** Set when the sliding window moved and the cookie has to be re-issued. */
	readonly renewedTo: Date | null;
}

/** The cookie carries the raw token; only its hash reaches the database. */
function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

function ttl(days: number): Date {
	return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export class SessionService {
	static create(
		userId: number,
		meta: { ip: string | null; userAgent: string | null },
		tx?: Tx
	): string {
		const token = randomBytes(32).toString('base64url');
		(tx ?? database)
			.insert(sessions)
			.values({
				id: hashToken(token),
				userId,
				expiresAt: ttl(SESSION_TTL_DAYS),
				ip: meta.ip,
				userAgent: meta.userAgent
			})
			.run();
		return token;
	}

	static resolve(token: string): ResolvedSession | null {
		const id = hashToken(token);
		const [row] = database
			.select({
				expiresAt: sessions.expiresAt,
				id: users.id,
				email: users.email,
				fullName: users.fullName,
				scope: users.scope,
				counterpartyId: users.counterpartyId,
				mustChangePassword: users.mustChangePassword,
				isActive: users.isActive,
				deletedAt: users.deletedAt
			})
			.from(sessions)
			.innerJoin(users, eq(users.id, sessions.userId))
			.where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
			.all();

		if (!row || !row.isActive || row.deletedAt !== null) return null;

		const codes = database
			.select({ code: roles.code })
			.from(userRoles)
			.innerJoin(roles, eq(roles.id, userRoles.roleId))
			.where(eq(userRoles.userId, row.id))
			.all()
			.map((r) => r.code);

		let renewedTo: Date | null = null;
		if (row.expiresAt.getTime() - Date.now() < RENEW_AFTER_DAYS * 24 * 60 * 60 * 1000) {
			renewedTo = ttl(SESSION_TTL_DAYS);
			database.update(sessions).set({ expiresAt: renewedTo }).where(eq(sessions.id, id)).run();
		}

		return {
			user: {
				id: row.id,
				email: row.email,
				fullName: row.fullName,
				scope: row.scope,
				counterpartyId: row.counterpartyId,
				mustChangePassword: row.mustChangePassword,
				roles: codes
			},
			expiresAt: renewedTo ?? row.expiresAt,
			renewedTo
		};
	}

	static destroy(token: string): void {
		database
			.delete(sessions)
			.where(eq(sessions.id, hashToken(token)))
			.run();
	}

	/** A password change or a lockout kills every session the user has, on every device. */
	static destroyAllFor(userId: number, tx?: Tx): void {
		(tx ?? database).delete(sessions).where(eq(sessions.userId, userId)).run();
	}

	static purgeExpired(): number {
		return database.delete(sessions).where(lt(sessions.expiresAt, new Date())).run().changes;
	}

	static toActorContext(user: SessionUser, requestId: string): ActorContext {
		return {
			userId: user.id,
			roles: user.roles,
			scope: user.scope,
			counterpartyId: user.counterpartyId,
			canSeePrices: PolicyService.canSeePrices(user.roles),
			canSeeCost: PolicyService.canSeeCost(user.roles),
			requestId
		};
	}
}
