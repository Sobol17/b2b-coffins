import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { FINANCE_KINDS } from '$lib/types/finance';
import { createdAt, pk, ts, updatedAt } from './_shared';
import { users } from './users';

// Manual entries of the owner (tech.md 5.11, v1.58). Order payments, payroll payouts and fund
// transfers are read from their own tables and never copied here, so the two cannot drift apart.
export const financeEntries = sqliteTable(
	'finance_entries',
	{
		id: pk(),
		kind: text('kind', { enum: FINANCE_KINDS }).notNull(),
		// Always above zero: the kind gives the sign.
		amountMinor: integer('amount_minor').notNull(),
		// Start of the calendar day in org.timezone.
		occurredAt: ts('occurred_at').notNull(),
		comment: text('comment').notNull(),
		createdById: integer('created_by_id')
			.notNull()
			.references(() => users.id),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
		deletedAt: ts('deleted_at')
	},
	(t) => [index('finance_entries_occurred_idx').on(t.occurredAt)]
);
