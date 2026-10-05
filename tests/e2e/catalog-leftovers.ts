import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq, inArray, like } from 'drizzle-orm';
import type { Db } from '../../src/lib/server/db/client';
import {
	categories,
	discountRules,
	media,
	priceLists,
	productVariants,
	products,
	requestItems
} from '../../src/lib/server/db/schema';

/**
 * The CRM catalog spec leaves a category, a model and a price list on every run. The storefront
 * draws every top-level category, even an empty one, so hiding the model is not enough: the rows
 * go before other specs count the groups.
 */
export function removeCatalogLeftovers(db: Db, filesDir: string): void {
	const categoryIds = db
		.select({ id: categories.id })
		.from(categories)
		.where(like(categories.title, 'Категория C2 %'))
		.all()
		.map((row) => row.id);
	const productIds = db
		.select({ id: products.id })
		.from(products)
		.where(like(products.sku, 'C2-%'))
		.all()
		.map((row) => row.id);
	const held = heldProductIds(db, productIds);
	const removable = productIds.filter((id) => !held.has(id));

	db.transaction((tx) => {
		// A model with history cannot go: it leaves the catalog the way CRM removes one.
		tx.update(products)
			.set({ categoryId: null, isPublished: false, deletedAt: new Date() })
			.where(inArray(products.id, [...held]))
			.run();
		tx.delete(media)
			.where(and(eq(media.ownerScope, 'product'), inArray(media.ownerId, removable)))
			.run();
		// Variants, their options, price list items and agency prices cascade from the model.
		tx.delete(products).where(inArray(products.id, removable)).run();
		tx.delete(priceLists).where(like(priceLists.title, 'Прайс C2 %')).run();
		tx.delete(discountRules).where(inArray(discountRules.categoryId, categoryIds)).run();
		tx.delete(categories).where(inArray(categories.id, categoryIds)).run();
	});

	for (const id of removable) {
		rmSync(join(filesDir, 'product', String(id)), { recursive: true, force: true });
	}
}

/** Models whose variants a request line points at: that reference does not cascade. */
function heldProductIds(db: Db, productIds: readonly number[]): Set<number> {
	if (productIds.length === 0) return new Set();
	const ofProducts = inArray(productVariants.productId, [...productIds]);
	const ordered = db
		.select({ id: productVariants.productId })
		.from(productVariants)
		.innerJoin(requestItems, eq(requestItems.variantId, productVariants.id))
		.where(ofProducts)
		.all();
	return new Set(ordered.map((row) => row.id));
}
