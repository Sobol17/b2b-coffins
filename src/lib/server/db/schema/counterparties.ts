import {
	index,
	integer,
	real,
	sqliteTable,
	text,
	type AnySQLiteColumn
} from 'drizzle-orm/sqlite-core';
import { bool, createdAt, pk, ts, updatedAt } from './_shared';
import { priceLists } from './pricing';
import { users } from './users';
import { media } from './catalog';

export const counterparties = sqliteTable(
	'counterparties',
	{
		id: pk(),
		name: text('name').notNull(),
		legalName: text('legal_name'),
		inn: text('inn'),
		kpp: text('kpp'),
		address: text('address'),
		phone: text('phone'),
		email: text('email'),
		priceListId: integer('price_list_id').references(() => priceLists.id),
		discountPercent: integer('discount_percent').notNull().default(0), // 0..100, integer percent
		settlementScheme: text('settlement_scheme', { enum: ['on_fact', 'weekly', 'monthly'] })
			.notNull()
			.default('on_fact'),
		// Circular reference users <-> counterparties: the thunk plus the explicit column type
		// is the Drizzle-documented way to keep TypeScript from recursing forever.
		managerId: integer('manager_id').references((): AnySQLiteColumn => users.id),
		staffLimit: integer('staff_limit').notNull().default(10),
		notes: text('notes'),
		isActive: bool('is_active').notNull().default(true),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
		deletedAt: ts('deleted_at')
	},
	(t) => [index('cp_name_idx').on(t.name)]
);

export const deliveryAddresses = sqliteTable('delivery_addresses', {
	id: pk(),
	counterpartyId: integer('counterparty_id')
		.notNull()
		.references(() => counterparties.id, { onDelete: 'cascade' }),
	title: text('title').notNull(),
	address: text('address').notNull(),
	contactName: text('contact_name'),
	contactPhone: text('contact_phone'),
	lat: real('lat'),
	lon: real('lon'),
	isDefault: bool('is_default').notNull().default(false),
	deletedAt: ts('deleted_at'),
	createdAt: createdAt()
});

export const contracts = sqliteTable('contracts', {
	id: pk(),
	counterpartyId: integer('counterparty_id')
		.notNull()
		.references(() => counterparties.id, { onDelete: 'cascade' }),
	number: text('number').notNull(),
	signedAt: ts('signed_at'),
	validUntil: ts('valid_until'),
	fileId: integer('file_id').references(() => media.id),
	createdAt: createdAt()
});
