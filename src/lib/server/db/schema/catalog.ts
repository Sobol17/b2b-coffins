import {
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex,
	type AnySQLiteColumn
} from 'drizzle-orm/sqlite-core';
import { OPTION_KINDS } from '$lib/types/catalog';
import { DICT_CODES } from '$lib/types/dicts';
import { bool, createdAt, money, pk, ts, updatedAt } from './_shared';
import { stockItems } from './stock';
import { users } from './users';

export const categories = sqliteTable('categories', {
	id: pk(),
	title: text('title').notNull(),
	parentId: integer('parent_id').references((): AnySQLiteColumn => categories.id),
	sortOrder: integer('sort_order').notNull().default(0)
});

export const products = sqliteTable(
	'products',
	{
		id: pk(),
		sku: text('sku').notNull(),
		title: text('title').notNull(),
		categoryId: integer('category_id').references(() => categories.id),
		description: text('description'),
		isPublished: bool('is_published').notNull().default(false),
		sortOrder: integer('sort_order').notNull().default(0),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
		deletedAt: ts('deleted_at')
	},
	(t) => [uniqueIndex('products_sku_uq').on(t.sku)]
);

/** Variant = size + material. Price and stock hang on the variant. */
export const productVariants = sqliteTable(
	'product_variants',
	{
		id: pk(),
		productId: integer('product_id')
			.notNull()
			.references(() => products.id, { onDelete: 'cascade' }),
		sku: text('sku').notNull(),
		sizeCode: text('size_code').notNull(),
		materialId: integer('material_id')
			.notNull()
			.references(() => dictItems.id),
		lengthMm: integer('length_mm'),
		widthMm: integer('width_mm'),
		heightMm: integer('height_mm'),
		weightG: integer('weight_g'),
		basePriceMinor: money('base_price_minor'),
		costPriceMinor: money('cost_price_minor'), // visible to owner role only
		stockItemId: integer('stock_item_id').references(() => stockItems.id),
		isPublished: bool('is_published').notNull().default(false),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
		deletedAt: ts('deleted_at')
	},
	(t) => [uniqueIndex('variants_sku_uq').on(t.sku), index('variants_product_idx').on(t.productId)]
);

/** Options: the colour of the product, the only choice besides the size (v1.22). */
export const options = sqliteTable('options', {
	id: pk(),
	kind: text('kind', { enum: OPTION_KINDS }).notNull(),
	title: text('title').notNull(),
	priceDeltaMinor: integer('price_delta_minor').notNull().default(0),
	stockItemId: integer('stock_item_id').references(() => stockItems.id),
	isActive: bool('is_active').notNull().default(true)
});

/** Compatibility matrix: which options are allowed for a variant. */
export const productOptions = sqliteTable(
	'product_options',
	{
		variantId: integer('variant_id')
			.notNull()
			.references(() => productVariants.id, { onDelete: 'cascade' }),
		optionId: integer('option_id')
			.notNull()
			.references(() => options.id, { onDelete: 'cascade' }),
		isDefault: bool('is_default').notNull().default(false)
	},
	(t) => [primaryKey({ columns: [t.variantId, t.optionId] })]
);

/** Single dictionary table for materials, finishes, fabrics, work types, refusal reasons, etc. */
export const dictItems = sqliteTable(
	'dict_items',
	{
		id: pk(),
		dict: text('dict', { enum: DICT_CODES }).notNull(),
		code: text('code').notNull(),
		title: text('title').notNull(),
		extra: text('extra', { mode: 'json' }).$type<Record<string, unknown>>(),
		sortOrder: integer('sort_order').notNull().default(0),
		isActive: bool('is_active').notNull().default(true)
	},
	(t) => [uniqueIndex('dict_code_uq').on(t.dict, t.code)]
);

export const media = sqliteTable(
	'media',
	{
		id: pk(),
		path: text('path').notNull(), // relative to FILES_DIR, never client-controlled
		mime: text('mime').notNull(),
		sizeBytes: integer('size_bytes').notNull(),
		width: integer('width'),
		height: integer('height'),
		ownerScope: text('owner_scope', {
			enum: ['product', 'request', 'contract', 'import']
		}).notNull(),
		ownerId: integer('owner_id'),
		sortOrder: integer('sort_order').notNull().default(0),
		uploadedBy: integer('uploaded_by').references(() => users.id),
		createdAt: createdAt()
	},
	(t) => [index('media_owner_idx').on(t.ownerScope, t.ownerId)]
);
