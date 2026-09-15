import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../../src/lib/server/db/client';
import type { OptionKind } from '../../src/lib/types/catalog';
import {
	categories,
	options,
	productOptions,
	productVariants,
	products,
	stockItems,
	stockMoves
} from '../../src/lib/server/db/schema';
import { catalogFixture, loadFixture, stockBalanceFixture, stockItemFixture } from './schema';
import { dictIdByCode } from './reference';

export function seedStockItems(db: Db): number {
	const rows = loadFixture('stock-items.json', z.array(stockItemFixture));
	for (const row of rows) {
		const unitId = dictIdByCode(db, 'unit', row.unit);
		db.insert(stockItems)
			.values({
				kind: row.kind,
				code: row.code,
				title: row.title,
				unitId,
				minThreshold: row.minThreshold
			})
			.onConflictDoUpdate({
				target: stockItems.code,
				set: { title: row.title, unitId, minThreshold: row.minThreshold }
			})
			.run();
	}
	return rows.length;
}

/**
 * Opening balances, so the storefront has stock to show before the warehouse screens exist (C8).
 * Moves are append-only: an item that already has any move is left alone on a rerun.
 */
export function seedStockBalances(db: Db): number {
	const rows = loadFixture('stock-balances.json', z.array(stockBalanceFixture));
	let posted = 0;
	for (const row of rows) {
		const [item] = db
			.select({ id: stockItems.id })
			.from(stockItems)
			.where(eq(stockItems.code, row.stockItem))
			.all();
		if (!item) throw new Error(`stock balance references unknown item ${row.stockItem}`);
		const [existing] = db
			.select({ id: stockMoves.id })
			.from(stockMoves)
			.where(eq(stockMoves.stockItemId, item.id))
			.limit(1)
			.all();
		if (existing) continue;
		db.insert(stockMoves)
			.values({
				stockItemId: item.id,
				qty: row.qty,
				type: 'inventory',
				comment: 'Начальный остаток из сида',
				occurredAt: new Date()
			})
			.run();
		posted += 1;
	}
	return posted;
}

function upsertCategory(db: Db, title: string, sortOrder: number): number {
	const [existing] = db
		.select({ id: categories.id })
		.from(categories)
		.where(eq(categories.title, title))
		.all();
	if (existing) return existing.id;
	const [inserted] = db.insert(categories).values({ title, sortOrder }).returning().all();
	if (!inserted) throw new Error(`failed to insert category ${title}`);
	return inserted.id;
}

function upsertOption(
	db: Db,
	value: {
		kind: OptionKind;
		title: string;
		priceDeltaMinor: number;
	}
): number {
	const [existing] = db
		.select({ id: options.id })
		.from(options)
		.where(and(eq(options.kind, value.kind), eq(options.title, value.title)))
		.all();
	if (existing) {
		db.update(options)
			.set({ priceDeltaMinor: value.priceDeltaMinor })
			.where(eq(options.id, existing.id))
			.run();
		return existing.id;
	}
	const [inserted] = db.insert(options).values(value).returning().all();
	if (!inserted) throw new Error(`failed to insert option ${value.title}`);
	return inserted.id;
}

/** Every variant gets its own product-kind stock item, so C8 can post moves without a migration. */
function upsertVariantStockItem(db: Db, sku: string, title: string, unitId: number): number {
	const [row] = db
		.insert(stockItems)
		.values({ kind: 'product', code: sku, title, unitId })
		.onConflictDoUpdate({ target: stockItems.code, set: { title } })
		.returning()
		.all();
	if (!row) throw new Error(`failed to upsert stock item ${sku}`);
	return row.id;
}

export function seedCatalog(db: Db): { products: number; variants: number } {
	const fixture = loadFixture('catalog.json', catalogFixture);
	const pcsUnitId = dictIdByCode(db, 'unit', 'pcs');

	const categoryIds = new Map(
		fixture.categories.map((c) => [c.code, upsertCategory(db, c.title, c.sortOrder)])
	);
	const optionIds = new Map(
		fixture.options.map((o) => [
			o.code,
			upsertOption(db, { kind: o.kind, title: o.title, priceDeltaMinor: o.priceDeltaMinor })
		])
	);

	let variantCount = 0;
	for (const product of fixture.products) {
		const categoryId = categoryIds.get(product.category);
		if (!categoryId) throw new Error(`unknown category ${product.category}`);

		const [productRow] = db
			.insert(products)
			.values({
				sku: product.sku,
				title: product.title,
				categoryId,
				description: product.description,
				isPublished: true,
				sortOrder: product.sortOrder
			})
			.onConflictDoUpdate({
				target: products.sku,
				set: { title: product.title, categoryId, description: product.description }
			})
			.returning()
			.all();
		if (!productRow) throw new Error(`failed to upsert product ${product.sku}`);

		for (const variant of product.variants) {
			const materialId = dictIdByCode(db, 'material', variant.material);
			const stockItemId = upsertVariantStockItem(db, variant.sku, product.title, pcsUnitId);
			const values = {
				productId: productRow.id,
				sku: variant.sku,
				sizeCode: variant.sizeCode,
				materialId,
				lengthMm: variant.lengthMm,
				widthMm: variant.widthMm,
				heightMm: variant.heightMm,
				weightG: variant.weightG,
				basePriceMinor: variant.basePriceMinor,
				costPriceMinor: variant.costPriceMinor,
				stockItemId,
				isPublished: true
			};
			const [variantRow] = db
				.insert(productVariants)
				.values(values)
				.onConflictDoUpdate({ target: productVariants.sku, set: values })
				.returning()
				.all();
			if (!variantRow) throw new Error(`failed to upsert variant ${variant.sku}`);
			variantCount += 1;

			for (const [index, optionCode] of product.options.entries()) {
				const optionId = optionIds.get(optionCode);
				if (!optionId) throw new Error(`unknown option ${optionCode} on ${product.sku}`);
				db.insert(productOptions)
					.values({ variantId: variantRow.id, optionId, isDefault: index === 0 })
					.onConflictDoNothing()
					.run();
			}
		}
	}

	return { products: fixture.products.length, variants: variantCount };
}
