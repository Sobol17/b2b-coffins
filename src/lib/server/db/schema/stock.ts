import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
	type AnySQLiteColumn
} from 'drizzle-orm/sqlite-core';
import { STOCK_MOVE_TYPES } from '$lib/types/dicts';
import { bool, createdAt, pk, ts, updatedAt } from './_shared';
import { dictItems, media, options, productVariants } from './catalog';
import { requests } from './requests';
import { users } from './users';

export const stockItems = sqliteTable(
	'stock_items',
	{
		id: pk(),
		kind: text('kind', { enum: ['product', 'component'] }).notNull(),
		code: text('code').notNull(),
		title: text('title').notNull(),
		unitId: integer('unit_id')
			.notNull()
			.references(() => dictItems.id), // dict = 'unit'
		minThreshold: integer('min_threshold').notNull().default(0),
		isActive: bool('is_active').notNull().default(true),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [uniqueIndex('stock_items_code_uq').on(t.code)]
);

/** Balance is never stored. It is the sum of moves. Append-only table. */
export const stockMoves = sqliteTable(
	'stock_moves',
	{
		id: pk(),
		stockItemId: integer('stock_item_id')
			.notNull()
			.references(() => stockItems.id),
		// The colour of a product: two colours of one variant are two positions (tech.md v1.41).
		optionId: integer('option_id').references(() => options.id),
		qty: integer('qty').notNull(), // signed: + income, - outcome
		type: text('type', { enum: STOCK_MOVE_TYPES }).notNull(),
		requestId: integer('request_id').references(() => requests.id),
		// Set when compensating a previous move: a delivery refusal never deletes history.
		reversalOfId: integer('reversal_of_id').references((): AnySQLiteColumn => stockMoves.id),
		reasonId: integer('reason_id').references(() => dictItems.id),
		comment: text('comment'),
		actorId: integer('actor_id').references(() => users.id),
		occurredAt: ts('occurred_at').notNull(),
		createdAt: createdAt()
	},
	(t) => [
		index('stock_moves_item_idx').on(t.stockItemId, t.occurredAt),
		index('stock_moves_request_idx').on(t.requestId)
	]
);

export const bomVersions = sqliteTable('bom_versions', {
	id: pk(),
	version: integer('version').notNull(),
	importedById: integer('imported_by_id').references(() => users.id),
	sourceFileId: integer('source_file_id').references(() => media.id),
	isActive: bool('is_active').notNull().default(false),
	createdAt: createdAt()
});

export const bomNorms = sqliteTable(
	'bom_norms',
	{
		id: pk(),
		bomVersionId: integer('bom_version_id')
			.notNull()
			.references(() => bomVersions.id, { onDelete: 'cascade' }),
		variantId: integer('variant_id')
			.notNull()
			.references(() => productVariants.id),
		componentId: integer('component_id')
			.notNull()
			.references(() => stockItems.id),
		qtyPerUnitMilli: integer('qty_per_unit_milli').notNull() // qty * 1000, integer math only
	},
	(t) => [uniqueIndex('bom_norms_uq').on(t.bomVersionId, t.variantId, t.componentId)]
);

export const inventories = sqliteTable('inventories', {
	id: pk(),
	status: text('status', { enum: ['draft', 'applied'] })
		.notNull()
		.default('draft'),
	comment: text('comment'),
	createdById: integer('created_by_id')
		.notNull()
		.references(() => users.id),
	appliedAt: ts('applied_at'),
	createdAt: createdAt()
});

export const inventoryLines = sqliteTable('inventory_lines', {
	id: pk(),
	inventoryId: integer('inventory_id')
		.notNull()
		.references(() => inventories.id, { onDelete: 'cascade' }),
	stockItemId: integer('stock_item_id')
		.notNull()
		.references(() => stockItems.id),
	expectedQty: integer('expected_qty').notNull(),
	actualQty: integer('actual_qty').notNull()
});
