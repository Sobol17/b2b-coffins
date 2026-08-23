import {
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';
import { REQUEST_STATUSES } from '$lib/types/request';
import { bool, createdAt, money, pk, ts, updatedAt } from './_shared';
import { dictItems, options, productVariants } from './catalog';
import { counterparties, deliveryAddresses } from './counterparties';
import { users } from './users';

export const requests = sqliteTable(
	'requests',
	{
		id: pk(),
		number: text('number').notNull(), // from numbering_sequences
		counterpartyId: integer('counterparty_id').references(() => counterparties.id), // null = stock request
		isStockRequest: bool('is_stock_request').notNull().default(false),
		createdById: integer('created_by_id')
			.notNull()
			.references(() => users.id),
		managerId: integer('manager_id').references(() => users.id),
		status: text('status', { enum: REQUEST_STATUSES }).notNull().default('draft'),
		priority: text('priority', { enum: ['normal', 'urgent'] })
			.notNull()
			.default('normal'),
		deliveryAddressId: integer('delivery_address_id').references(() => deliveryAddresses.id),
		isPickup: bool('is_pickup').notNull().default(false),
		externalNumber: text('external_number'), // counterparty own order number
		comment: text('comment'),
		itemsTotalMinor: money('items_total_minor'),
		discountMinor: money('discount_minor'),
		totalMinor: money('total_minor'),
		paidMinor: money('paid_minor'),
		charityRateBp: integer('charity_rate_bp'), // basis points, frozen on delivery
		charityAmountMinor: integer('charity_amount_minor'), // frozen on delivery, never recalculated
		submittedAt: ts('submitted_at'),
		acceptedAt: ts('accepted_at'),
		readyAt: ts('ready_at'),
		deliveredAt: ts('delivered_at'),
		paidAt: ts('paid_at'),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [
		uniqueIndex('requests_number_uq').on(t.number),
		index('requests_cp_status_idx').on(t.counterpartyId, t.status),
		index('requests_status_idx').on(t.status, t.priority),
		index('requests_created_idx').on(t.createdAt)
	]
);

export const requestItems = sqliteTable(
	'request_items',
	{
		id: pk(),
		requestId: integer('request_id')
			.notNull()
			.references(() => requests.id, { onDelete: 'cascade' }),
		variantId: integer('variant_id')
			.notNull()
			.references(() => productVariants.id),
		qty: integer('qty').notNull(),
		unitPriceMinor: money('unit_price_minor'), // frozen at accept
		lineTotalMinor: money('line_total_minor'),
		engraving: text('engraving'),
		comment: text('comment')
	},
	(t) => [index('request_items_request_idx').on(t.requestId)]
);

export const requestItemOptions = sqliteTable(
	'request_item_options',
	{
		itemId: integer('item_id')
			.notNull()
			.references(() => requestItems.id, { onDelete: 'cascade' }),
		optionId: integer('option_id')
			.notNull()
			.references(() => options.id),
		priceDeltaMinor: integer('price_delta_minor').notNull().default(0)
	},
	(t) => [primaryKey({ columns: [t.itemId, t.optionId] })]
);

export const requestAssignees = sqliteTable(
	'request_assignees',
	{
		requestId: integer('request_id')
			.notNull()
			.references(() => requests.id, { onDelete: 'cascade' }),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id),
		role: text('role', { enum: ['carpenter', 'painter', 'driver'] }).notNull(),
		takenAt: ts('taken_at'),
		doneAt: ts('done_at')
	},
	(t) => [primaryKey({ columns: [t.requestId, t.userId, t.role] })]
);

export const requestStatusHistory = sqliteTable(
	'request_status_history',
	{
		id: pk(),
		requestId: integer('request_id')
			.notNull()
			.references(() => requests.id, { onDelete: 'cascade' }),
		fromStatus: text('from_status', { enum: REQUEST_STATUSES }),
		toStatus: text('to_status', { enum: REQUEST_STATUSES }).notNull(),
		actorId: integer('actor_id').references(() => users.id), // null = system transition
		reasonId: integer('reason_id').references(() => dictItems.id),
		comment: text('comment'),
		createdAt: createdAt()
	},
	(t) => [index('rsh_request_idx').on(t.requestId, t.createdAt)]
);

export const paymentMarks = sqliteTable(
	'payment_marks',
	{
		id: pk(),
		requestId: integer('request_id')
			.notNull()
			.references(() => requests.id, { onDelete: 'cascade' }),
		amountMinor: money('amount_minor'),
		paidAt: ts('paid_at').notNull(),
		method: text('method', { enum: ['cash', 'bank', 'card', 'offset'] }).notNull(),
		comment: text('comment'),
		createdById: integer('created_by_id')
			.notNull()
			.references(() => users.id),
		createdAt: createdAt()
	},
	(t) => [index('pm_request_idx').on(t.requestId)]
);

export const comments = sqliteTable(
	'comments',
	{
		id: pk(),
		requestId: integer('request_id')
			.notNull()
			.references(() => requests.id, { onDelete: 'cascade' }),
		authorId: integer('author_id')
			.notNull()
			.references(() => users.id),
		body: text('body').notNull(),
		isInternal: bool('is_internal').notNull().default(false), // hidden from portal
		createdAt: createdAt()
	},
	(t) => [index('comments_request_idx').on(t.requestId, t.createdAt)]
);
