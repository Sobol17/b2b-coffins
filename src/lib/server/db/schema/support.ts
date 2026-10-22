import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { SUPPORT_SIDES, SUPPORT_THREAD_STATUSES } from '$lib/types/support';
import { createdAt, pk, ts, updatedAt } from './_shared';
import { counterparties } from './counterparties';
import { requests } from './requests';
import { users } from './users';

// Counterparty questions to the workshop (tech.md 5.10, v1.57). Rows are never deleted.
export const supportThreads = sqliteTable(
	'support_threads',
	{
		id: pk(),
		counterpartyId: integer('counterparty_id')
			.notNull()
			.references(() => counterparties.id),
		createdById: integer('created_by_id')
			.notNull()
			.references(() => users.id),
		requestId: integer('request_id').references(() => requests.id),
		subject: text('subject').notNull(),
		status: text('status', { enum: SUPPORT_THREAD_STATUSES }).notNull().default('open'),
		// Denormalized from the newest message: the lists sort and mark «whose turn» without a join.
		lastMessageAt: ts('last_message_at').notNull(),
		lastMessageSide: text('last_message_side', { enum: SUPPORT_SIDES }).notNull(),
		closedAt: ts('closed_at'),
		closedById: integer('closed_by_id').references(() => users.id),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [
		index('support_threads_cp_idx').on(t.counterpartyId, t.lastMessageAt),
		index('support_threads_author_idx').on(t.createdById, t.lastMessageAt),
		index('support_threads_status_idx').on(t.status, t.lastMessageAt)
	]
);

export const supportMessages = sqliteTable(
	'support_messages',
	{
		id: pk(),
		threadId: integer('thread_id')
			.notNull()
			.references(() => supportThreads.id),
		authorId: integer('author_id')
			.notNull()
			.references(() => users.id),
		// The author's contour at the time of writing: a scope change later must not flip old messages.
		side: text('side', { enum: SUPPORT_SIDES }).notNull(),
		body: text('body').notNull(),
		createdAt: createdAt()
	},
	(t) => [index('support_messages_thread_idx').on(t.threadId, t.createdAt)]
);
