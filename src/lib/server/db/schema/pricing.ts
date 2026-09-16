import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { bool, createdAt, money, pk, ts, updatedAt } from './_shared';
import { categories, productVariants, products } from './catalog';
import { counterparties } from './counterparties';
import { users } from './users';

export const priceLists = sqliteTable('price_lists', {
	id: pk(),
	title: text('title').notNull(),
	isBase: bool('is_base').notNull().default(false),
	validFrom: ts('valid_from'),
	validTo: ts('valid_to'),
	createdAt: createdAt(),
	updatedAt: updatedAt()
});

export const priceListItems = sqliteTable(
	'price_list_items',
	{
		id: pk(),
		priceListId: integer('price_list_id')
			.notNull()
			.references(() => priceLists.id, { onDelete: 'cascade' }),
		variantId: integer('variant_id')
			.notNull()
			.references(() => productVariants.id, { onDelete: 'cascade' }),
		priceMinor: money('price_minor')
	},
	(t) => [uniqueIndex('pli_uq').on(t.priceListId, t.variantId)]
);

/**
 * Agency price (P7): the counterparty sets it for its own client. Display only, one price per
 * model, so neither the size nor the options move it and no request sum ever reads it.
 */
export const counterpartyProductPrices = sqliteTable(
	'counterparty_product_prices',
	{
		id: pk(),
		counterpartyId: integer('counterparty_id')
			.notNull()
			.references(() => counterparties.id, { onDelete: 'cascade' }),
		productId: integer('product_id')
			.notNull()
			.references(() => products.id, { onDelete: 'cascade' }),
		priceMinor: money('price_minor'),
		updatedById: integer('updated_by_id')
			.notNull()
			.references(() => users.id),
		updatedAt: updatedAt()
	},
	(t) => [uniqueIndex('cpp_uq').on(t.counterpartyId, t.productId)]
);

export const discountRules = sqliteTable('discount_rules', {
	id: pk(),
	counterpartyId: integer('counterparty_id').references(() => counterparties.id, {
		onDelete: 'cascade'
	}),
	categoryId: integer('category_id').references(() => categories.id),
	percent: integer('percent').notNull(),
	validFrom: ts('valid_from'),
	validTo: ts('valid_to')
});
