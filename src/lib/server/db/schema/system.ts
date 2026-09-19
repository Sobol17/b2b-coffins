import {
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';
import { JOB_TOPICS } from '$lib/types/dicts';
import { EVENT_KEYS } from '$lib/types/events';
import { NOTIFICATION_CHANNELS } from '$lib/types/notifications';
import { ROLE_CODES } from '$lib/types/roles';
import { bool, createdAt, money, pk, ts, updatedAt } from './_shared';
import { users } from './users';

export const charityTransfers = sqliteTable('charity_transfers', {
	id: pk(),
	amountMinor: money('amount_minor'),
	transferredAt: ts('transferred_at').notNull(),
	documentRef: text('document_ref'),
	comment: text('comment'),
	createdById: integer('created_by_id')
		.notNull()
		.references(() => users.id),
	createdAt: createdAt()
});

/** Read model for the public banner. Rebuilt by a job, never the source of truth. */
export const charityTotals = sqliteTable('charity_totals', {
	scope: text('scope').primaryKey(), // 'all' | 'year:2026' | 'cp:12'
	amountMinor: money('amount_minor'),
	requestCount: integer('request_count').notNull().default(0),
	updatedAt: updatedAt()
});

export const numberingSequences = sqliteTable('numbering_sequences', {
	key: text('key').primaryKey(), // 'request'
	prefix: text('prefix').notNull().default(''),
	period: text('period', { enum: ['none', 'year', 'month'] })
		.notNull()
		.default('year'),
	periodKey: text('period_key').notNull().default(''),
	lastValue: integer('last_value').notNull().default(0)
});

export const notificationTemplates = sqliteTable(
	'notification_templates',
	{
		id: pk(),
		eventKey: text('event_key', { enum: EVENT_KEYS }).notNull(),
		channel: text('channel', { enum: NOTIFICATION_CHANNELS }).notNull(),
		subject: text('subject'),
		body: text('body').notNull(),
		isActive: bool('is_active').notNull().default(true)
	},
	(t) => [uniqueIndex('nt_uq').on(t.eventKey, t.channel)]
);

export const notificationRules = sqliteTable(
	'notification_rules',
	{
		eventKey: text('event_key', { enum: EVENT_KEYS }).notNull(),
		roleCode: text('role_code', { enum: ROLE_CODES }).notNull(),
		channel: text('channel', { enum: NOTIFICATION_CHANNELS }).notNull(),
		enabled: bool('enabled').notNull().default(true)
	},
	(t) => [primaryKey({ columns: [t.eventKey, t.roleCode, t.channel] })]
);

export const userNotificationPrefs = sqliteTable(
	'user_notification_prefs',
	{
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		eventKey: text('event_key', { enum: EVENT_KEYS }).notNull(),
		channel: text('channel', { enum: NOTIFICATION_CHANNELS }).notNull(),
		enabled: bool('enabled').notNull()
	},
	(t) => [primaryKey({ columns: [t.userId, t.eventKey, t.channel] })]
);

export const notifications = sqliteTable(
	'notifications',
	{
		id: pk(),
		eventKey: text('event_key', { enum: EVENT_KEYS }).notNull(),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		channel: text('channel', { enum: NOTIFICATION_CHANNELS }).notNull(),
		payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
		status: text('status', { enum: ['queued', 'sent', 'failed'] })
			.notNull()
			.default('queued'),
		attempts: integer('attempts').notNull().default(0),
		error: text('error'),
		sentAt: ts('sent_at'),
		createdAt: createdAt()
	},
	(t) => [index('notifications_user_idx').on(t.userId, t.createdAt)]
);

/**
 * The in-app feed of the bell. One row per (user, event), whatever channels the matrix picked:
 * a channel row would show the same event twice. The unique index makes the fanout job idempotent.
 */
export const notificationFeed = sqliteTable(
	'notification_feed',
	{
		id: pk(),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		eventKey: text('event_key', { enum: EVENT_KEYS }).notNull(),
		entityId: integer('entity_id').notNull(),
		readAt: ts('read_at'),
		createdAt: createdAt()
	},
	(t) => [
		index('feed_user_idx').on(t.userId, t.createdAt),
		uniqueIndex('feed_uq').on(t.userId, t.eventKey, t.entityId)
	]
);

export const pushSubscriptions = sqliteTable(
	'push_subscriptions',
	{
		id: pk(),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		endpoint: text('endpoint').notNull(),
		p256dh: text('p256dh').notNull(),
		auth: text('auth').notNull(),
		createdAt: createdAt(),
		lastUsedAt: ts('last_used_at')
	},
	(t) => [uniqueIndex('push_endpoint_uq').on(t.endpoint)]
);

export const jobQueue = sqliteTable(
	'job_queue',
	{
		id: pk(),
		topic: text('topic', { enum: JOB_TOPICS }).notNull(),
		payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
		idempotencyKey: text('idempotency_key').notNull(),
		status: text('status', { enum: ['pending', 'running', 'done', 'failed', 'dead'] })
			.notNull()
			.default('pending'),
		attempts: integer('attempts').notNull().default(0),
		maxAttempts: integer('max_attempts').notNull().default(5),
		visibleAt: ts('visible_at').notNull(),
		lockedAt: ts('locked_at'),
		lockedBy: text('locked_by'),
		lastError: text('last_error'),
		createdAt: createdAt(),
		finishedAt: ts('finished_at')
	},
	(t) => [
		uniqueIndex('job_idem_uq').on(t.topic, t.idempotencyKey),
		index('job_poll_idx').on(t.status, t.visibleAt)
	]
);

export const auditLog = sqliteTable(
	'audit_log',
	{
		id: pk(),
		actorId: integer('actor_id').references(() => users.id),
		action: text('action').notNull(), // 'request.accept', 'payroll.close'
		entity: text('entity').notNull(),
		entityId: integer('entity_id'),
		before: text('before', { mode: 'json' }).$type<Record<string, unknown>>(),
		after: text('after', { mode: 'json' }).$type<Record<string, unknown>>(),
		ip: text('ip'),
		requestId: text('request_id'),
		createdAt: createdAt()
	},
	(t) => [index('audit_entity_idx').on(t.entity, t.entityId, t.createdAt)]
);

export const settings = sqliteTable('settings', {
	key: text('key').primaryKey(),
	value: text('value', { mode: 'json' }).$type<unknown>().notNull(),
	updatedById: integer('updated_by_id').references(() => users.id),
	updatedAt: updatedAt()
});
