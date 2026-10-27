import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { and, eq, notInArray } from 'drizzle-orm';
import { z } from 'zod';
import { config } from '../../src/lib/server/config';
import type { Db } from '../../src/lib/server/db/client';
import { categories, dictItems, productVariants, products } from '../../src/lib/server/db/schema';
import { upsertVariantStockItem } from '../seed/catalog';
import { dictIdByCode } from '../seed/reference';
import { readOptions, STRING_OPTION } from './args';
import { attachPhotos, loadPhotos, type PhotoSource } from './catalog-photos';

const optionsSchema = z.object({
	file: z.string().min(1),
	'hide-others': z.boolean().optional()
});

const dimension = z.number().int().positive().optional();

/**
 * A workshop price list as a catalog. Unlike the demo seed it carries no cost and no sizes it does
 * not know: the cost is filled in the CRM by hand (tech.md v1.47), a missing size stays empty.
 */
export const catalogImportSchema = z.object({
	comment: z.string().optional(),
	materials: z
		.array(
			z.object({ code: z.string().min(1), title: z.string().min(1), sortOrder: z.number().int() })
		)
		.default([]),
	categories: z.array(
		z.object({ code: z.string().min(1), title: z.string().min(1), sortOrder: z.number().int() })
	),
	products: z.array(
		z.object({
			sku: z.string().min(1),
			title: z.string().min(1),
			category: z.string().min(1),
			sortOrder: z.number().int(),
			description: z.string().min(1).optional(),
			// Paths relative to the folder of the file; the first photo becomes the cover.
			photos: z.array(z.string().min(1)).default([]),
			variants: z
				.array(
					z.object({
						sku: z.string().min(1),
						sizeCode: z.string().min(1),
						material: z.string().min(1),
						lengthMm: dimension,
						widthMm: dimension,
						heightMm: dimension,
						weightG: dimension,
						basePriceMinor: z.number().int().positive()
					})
				)
				.min(1)
		})
	)
});

export type CatalogImport = z.infer<typeof catalogImportSchema>;

export interface CatalogImportResult {
	readonly products: number;
	readonly variants: number;
	readonly hidden: number;
	readonly photos: number;
}

/** Categories are matched by title, so a section the CRM already has is reused, not doubled. */
function upsertCategory(db: Db, title: string, sortOrder: number): number {
	const [existing] = db
		.select({ id: categories.id })
		.from(categories)
		.where(eq(categories.title, title))
		.all();
	if (existing) {
		db.update(categories).set({ sortOrder }).where(eq(categories.id, existing.id)).run();
		return existing.id;
	}
	const [row] = db.insert(categories).values({ title, sortOrder }).returning().all();
	if (!row) throw new Error(`failed to insert category ${title}`);
	return row.id;
}

function upsertProduct(
	db: Db,
	product: CatalogImport['products'][number],
	categoryId: number
): number {
	const values = {
		title: product.title,
		categoryId,
		description: product.description ?? null,
		sortOrder: product.sortOrder
	};
	// A rerun updates the price list, but never publishes again what the CRM has hidden.
	const [row] = db
		.insert(products)
		.values({ sku: product.sku, ...values, isPublished: true })
		.onConflictDoUpdate({ target: products.sku, set: values })
		.returning({ id: products.id })
		.all();
	if (!row) throw new Error(`failed to upsert product ${product.sku}`);
	return row.id;
}

function upsertVariant(
	db: Db,
	productId: number,
	title: string,
	variant: CatalogImport['products'][number]['variants'][number],
	pcsUnitId: number
): void {
	const values = {
		productId,
		sizeCode: variant.sizeCode,
		materialId: dictIdByCode(db, 'material', variant.material),
		lengthMm: variant.lengthMm ?? null,
		widthMm: variant.widthMm ?? null,
		heightMm: variant.heightMm ?? null,
		weightG: variant.weightG ?? null,
		basePriceMinor: variant.basePriceMinor,
		stockItemId: upsertVariantStockItem(db, variant.sku, title, pcsUnitId)
	};
	// The cost stays out of the update: the workshop fills it in the CRM after the first import.
	db.insert(productVariants)
		.values({ sku: variant.sku, ...values, isPublished: true })
		.onConflictDoUpdate({ target: productVariants.sku, set: values })
		.run();
}

/**
 * Loads a price list into the catalog in one transaction. Running it twice leaves the same
 * catalog. `hideOthers` takes every model outside the file off the portal, history stays intact.
 * Without `photos` the file's photos are not read at all.
 */
export function importCatalog(
	db: Db,
	fixture: CatalogImport,
	{ hideOthers = false, photos }: { hideOthers?: boolean; photos?: PhotoSource } = {}
): CatalogImportResult {
	const loaded = photos ? loadPhotos(fixture.products, photos.sourceDir) : new Map();
	return db.transaction(() => {
		for (const material of fixture.materials) {
			db.insert(dictItems)
				.values({ dict: 'material', ...material, isActive: true })
				.onConflictDoUpdate({
					target: [dictItems.dict, dictItems.code],
					set: { title: material.title, sortOrder: material.sortOrder }
				})
				.run();
		}
		const pcsUnitId = dictIdByCode(db, 'unit', 'pcs');
		const categoryIds = new Map(
			fixture.categories.map((row) => [row.code, upsertCategory(db, row.title, row.sortOrder)])
		);

		let variants = 0;
		let attached = 0;
		for (const product of fixture.products) {
			const categoryId = categoryIds.get(product.category);
			if (categoryId === undefined) throw new Error(`unknown category ${product.category}`);
			const productId = upsertProduct(db, product, categoryId);
			if (photos)
				attached += attachPhotos(db, productId, loaded.get(product.sku) ?? [], photos.filesRoot);
			for (const variant of product.variants) {
				upsertVariant(db, productId, product.title, variant, pcsUnitId);
				variants += 1;
			}
		}

		const hidden = hideOthers
			? db
					.update(products)
					.set({ isPublished: false })
					.where(
						and(
							eq(products.isPublished, true),
							notInArray(
								products.sku,
								fixture.products.map((product) => product.sku)
							)
						)
					)
					.run().changes
			: 0;
		return { products: fixture.products.length, variants, hidden, photos: attached };
	});
}

export function catalogImport(db: Db, argv: readonly string[]): void {
	const options = readOptions(
		argv,
		{ file: STRING_OPTION, 'hide-others': { type: 'boolean' } },
		optionsSchema
	);
	const raw: unknown = JSON.parse(readFileSync(options.file, 'utf8'));
	const parsed = catalogImportSchema.safeParse(raw);
	if (!parsed.success)
		throw new Error(`${options.file} is invalid: ${z.prettifyError(parsed.error)}`);
	const result = importCatalog(db, parsed.data, {
		hideOthers: options['hide-others'] ?? false,
		photos: { sourceDir: dirname(options.file), filesRoot: config.FILES_DIR }
	});
	console.log(
		`catalog imported: ${result.products} models, ${result.variants} variants, ` +
			`${result.hidden} hidden, ${result.photos} photos`
	);
}
