import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { bool, createdAt, money, pk, ts, updatedAt } from './_shared';
import { categories, productVariants } from './catalog';
import { counterparties } from './counterparties';

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
