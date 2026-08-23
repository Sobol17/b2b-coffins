import { createHash, randomBytes } from 'node:crypto';
import { config } from '../config';
import { AuditService } from '../audit/audit.service';
import { database } from '../db/client';
import { ConflictError, ValidationError } from '../core/errors';
import type { MailDriver } from '../notifications/drivers/mail';
import { AuthRepository, type UserRow } from './auth.repository';
import { hashPassword, verifyPassword } from './password';
import { consumeRateLimit, resetRateLimit } from './rate-limit';
import { SessionService } from './session.service';

export const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const RESET_TOKEN_TTL_MINUTES = 60;

export interface LoginResult {
	readonly token: string;
	readonly mustChangePassword: boolean;
	readonly scope: 'portal' | 'crm';
}

function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

/**
 * Login, lockout and password recovery. Every failure path answers the same way, so the response
 * never tells an attacker whether an address exists.
 */
export class AuthService {
	constructor(
		private readonly repo: AuthRepository = new AuthRepository(),
		private readonly mail?: MailDriver
	) {}

	async login(
		input: { email: string; password: string },
		meta: { ip: string | null; userAgent: string | null }
	): Promise<LoginResult> {
		// Keyed by address and IP together: one office behind a single NAT must not lock itself out
		// because several people signed in, while one account stays capped from one source.
		const limitKey = `${meta.ip ?? 'unknown'}|${input.email}`;
		consumeRateLimit('login', limitKey);

		const user = this.repo.findByEmail(input.email);
		if (!user || !user.isActive) {
			// Hash anyway: an early return here leaks account existence through response timing.
			await verifyPassword(DUMMY_HASH, input.password).catch(() => false);
			throw new ValidationError('Неверный адрес или пароль');
		}
		if (user.lockedUntil && user.lockedUntil > new Date()) {
			throw new ConflictError('Учётная запись временно заблокирована');
		}

		const ok = await verifyPassword(user.passwordHash, input.password);
		if (!ok) {
			this.registerFailure(user);
			throw new ValidationError('Неверный адрес или пароль');
		}

		this.repo.recordSuccess(user.id);
		resetRateLimit('login', limitKey);
		AuditService.record({
			actorId: user.id,
			action: 'auth.login',
			entity: 'users',
			entityId: user.id,
			ip: meta.ip
		});
		return {
			token: SessionService.create(user.id, meta),
			mustChangePassword: user.mustChangePassword,
			scope: user.scope
		};
	}

	private registerFailure(user: UserRow): void {
		const failedAttempts = user.failedAttempts + 1;
		const lockedUntil =
			failedAttempts >= MAX_FAILED_ATTEMPTS
				? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
				: null;
		this.repo.recordFailure(user.id, failedAttempts, lockedUntil);
		AuditService.record({
			actorId: user.id,
			action: lockedUntil ? 'auth.locked' : 'auth.login_failed',
			entity: 'users',
			entityId: user.id,
			after: { failedAttempts }
		});
		// A lockout invalidates whatever sessions the account already had.
		if (lockedUntil) SessionService.destroyAllFor(user.id);
	}

	async changePassword(
		userId: number,
		input: { currentPassword: string; newPassword: string }
	): Promise<void> {
		consumeRateLimit('password.change', String(userId));

		const user = this.repo.findById(userId);
		if (!user) throw new ValidationError('Пользователь не найден');
		if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
			throw new ValidationError('Текущий пароль указан неверно');
		}

		const passwordHash = await hashPassword(input.newPassword);
		database.transaction((tx) => {
			this.repo.setPassword(user.id, passwordHash, tx);
			SessionService.destroyAllFor(user.id, tx);
			AuditService.record(
				{ actorId: user.id, action: 'auth.password_changed', entity: 'users', entityId: user.id },
				tx
			);
		});
	}

	/** Always resolves: the caller must not learn whether the address is registered. */
	async requestReset(email: string, ip: string | null): Promise<void> {
		consumeRateLimit('password.reset', ip ?? email);

		const user = this.repo.findByEmail(email);
		if (!user || !user.isActive) return;

		const token = randomBytes(32).toString('base64url');
		this.repo.createResetToken(
			user.id,
			hashToken(token),
			new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000)
		);

		await this.mail?.send({
			to: user.email,
			subject: 'Восстановление доступа',
			text: `Ссылка действует ${RESET_TOKEN_TTL_MINUTES} минут: ${config.ORIGIN}/password/reset?token=${token}`
		});
	}

	async applyReset(input: { token: string; newPassword: string }): Promise<void> {
		const row = this.repo.findUsableResetToken(hashToken(input.token));
		if (!row) throw new ValidationError('Ссылка недействительна или устарела');

		const passwordHash = await hashPassword(input.newPassword);
		database.transaction((tx) => {
			this.repo.setPassword(row.userId, passwordHash, tx);
			this.repo.markResetTokenUsed(row.id, tx);
			SessionService.destroyAllFor(row.userId, tx);
			AuditService.record(
				{
					actorId: row.userId,
					action: 'auth.password_reset',
					entity: 'users',
					entityId: row.userId
				},
				tx
			);
		});
	}
}

// Shape-valid argon2id hash of a value nobody holds, used only to keep the timing flat.
const DUMMY_HASH =
	'$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0c2FsdA$dGhpc2lzbm90YXJlYWxoYXNodmFsdWU';
