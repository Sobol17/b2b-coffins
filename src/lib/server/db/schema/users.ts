import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
	primaryKey
} from 'drizzle-orm/sqlite-core';
import { ROLE_CODES } from '$lib/types/roles';
import { bool, createdAt, pk, ts, updatedAt } from './_shared';
import { counterparties } from './counterparties';

export const users = sqliteTable(
	'users',
	{
		id: pk(),
		email: text('email').notNull(),
		login: text('login'),
		passwordHash: text('password_hash').notNull(),
		fullName: text('full_name').notNull(),
		phone: text('phone'),
		scope: text('scope', { enum: ['portal', 'crm'] }).notNull(),
		counterpartyId: integer('counterparty_id').references(() => counterparties.id), // null for crm scope
		isActive: bool('is_active').notNull().default(true),
		mustChangePassword: bool('must_change_password').notNull().default(true),
		failedAttempts: integer('failed_attempts').notNull().default(0),
		lockedUntil: ts('locked_until'),
		lastLoginAt: ts('last_login_at'),
		timezone: text('timezone').notNull().default('Europe/Moscow'),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
		deletedAt: ts('deleted_at')
	},
	(t) => [
		uniqueIndex('users_email_uq').on(t.email),
		index('users_counterparty_idx').on(t.counterpartyId)
	]
);

export const roles = sqliteTable(
	'roles',
	{
		id: pk(),
		code: text('code', { enum: ROLE_CODES }).notNull(),
		title: text('title').notNull()
	},
	(t) => [uniqueIndex('roles_code_uq').on(t.code)]
);

export const userRoles = sqliteTable(
	'user_roles',
	{
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		roleId: integer('role_id')
			.notNull()
			.references(() => roles.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.userId, t.roleId] })]
);

export const sessions = sqliteTable(
	'sessions',
	{
		id: text('id').primaryKey(), // 32-byte random, stored hashed
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		expiresAt: ts('expires_at').notNull(),
		ip: text('ip'),
		userAgent: text('user_agent'),
		createdAt: createdAt()
	},
	(t) => [index('sessions_user_idx').on(t.userId)]
);

export const passwordResetTokens = sqliteTable(
	'password_reset_tokens',
	{
		id: pk(),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		tokenHash: text('token_hash').notNull(),
		expiresAt: ts('expires_at').notNull(),
		usedAt: ts('used_at'),
		createdAt: createdAt()
	},
	(t) => [uniqueIndex('prt_token_uq').on(t.tokenHash)]
);

export const rateLimits = sqliteTable('rate_limits', {
	key: text('key').primaryKey(), // `${action}:${ip}` or `${action}:${userId}`
	hits: integer('hits').notNull().default(0),
	windowStart: ts('window_start').notNull(),
	blockedUntil: ts('blocked_until')
});
