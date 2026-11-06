import { describe, expect, it, vi } from 'vitest';
import { sqlite } from '../../src/lib/server/db/client';
import {
	categories,
	dictItems,
	media,
	products,
	productVariants
} from '../../src/lib/server/db/schema';
import { PublicCatalogService } from '../../src/lib/server/public-catalog/public-catalog.service';
import { migratedDatabase } from './helpers/db';

const db = migratedDatabase();
const [root] = db.insert(categories).values({ title: 'Гробы' }).returning().all();
const [child] = db
	.insert(categories)
	.values({ title: 'Деревянные', parentId: root!.id })
	.returning()
	.all();
const [other] = db.insert(categories).values({ title: 'Кресты' }).returning().all();
const [material] = db
	.insert(dictItems)
	.values({ dict: 'material', code: 'oak', title: 'Дуб' })
	.returning()
	.all();

function model(
	sku: string,
	title: string,
	categoryId: number | null,
	isPublished = true,
	deleted = false
): number {
	const [row] = db
		.insert(products)
		.values({
			sku,
			title,
			description: 'Массив дерева',
			categoryId,
			isPublished,
			deletedAt: deleted ? new Date() : null
		})
		.returning()
		.all();
	return row!.id;
}

const shown = model('PUBLIC-1', 'Классика', child!.id);
const noPhoto = model('PUBLIC-2', 'Без фотографии', root!.id);
const cross = model('CROSS', 'Крест', other!.id);
model('HIDDEN', 'Скрытая модель', root!.id, false);
model('DELETED', 'Удалённая модель', root!.id, true, true);
const [cover] = db
	.insert(media)
	.values({
		path: 'products/public.jpg',
		mime: 'image/jpeg',
		sizeBytes: 10,
		ownerScope: 'product',
		ownerId: shown,
		sortOrder: 1
	})
	.returning()
	.all();
db.insert(media)
	.values({
		path: 'products/second.jpg',
		mime: 'image/jpeg',
		sizeBytes: 10,
		ownerScope: 'product',
		ownerId: shown,
		sortOrder: 2
	})
	.run();

const [visibleVariant] = db
	.insert(productVariants)
	.values({
		productId: shown,
		sku: 'PUBLIC-1-200',
		sizeCode: '200',
		materialId: material!.id,
		lengthMm: 2000,
		widthMm: 600,
		heightMm: 450,
		basePriceMinor: 123456,
		costPriceMinor: 98765,
		isPublished: true
	})
	.returning()
	.all();
db.insert(productVariants)
	.values([
		{
			productId: shown,
			sku: 'PUBLIC-1-HIDDEN',
			sizeCode: 'hidden',
			materialId: material!.id,
			isPublished: false
		},
		{
			productId: shown,
			sku: 'PUBLIC-1-DELETED',
			sizeCode: 'deleted',
			materialId: material!.id,
			isPublished: true,
			deletedAt: new Date()
		}
	])
	.run();

describe('public catalog', () => {
	it('returns published models including those without photos and only published variants', () => {
		const page = new PublicCatalogService().list({ page: 1, perPage: 25 });
		expect(page.total).toBe(3);
		expect(page.rows.map((row) => row.id)).toEqual([shown, noPhoto, cross]);
		expect(page.rows[0]).toEqual({
			id: shown,
			sku: 'PUBLIC-1',
			title: 'Классика',
			description: 'Массив дерева',
			categoryId: child!.id,
			categoryTitle: 'Деревянные',
			coverMediaId: cover!.id,
			variants: [
				{
					id: visibleVariant!.id,
					sizeCode: '200',
					materialTitle: 'Дуб',
					lengthMm: 2000,
					widthMm: 600,
					heightMm: 450
				}
			]
		});
		expect(page.rows[1]?.coverMediaId).toBeNull();
		expect(page.rows[1]?.variants).toEqual([]);
	});

	it('searches title and article with literal wildcard characters', () => {
		const service = new PublicCatalogService();
		expect(
			service.list({ page: 1, perPage: 25, search: 'КЛАССИКА' }).rows.map((row) => row.id)
		).toEqual([shown]);
		expect(
			service.list({ page: 1, perPage: 25, search: 'public-2' }).rows.map((row) => row.id)
		).toEqual([noPhoto]);
		expect(service.list({ page: 1, perPage: 25, search: '%' }).total).toBe(0);
	});

	it('filters a category tree and applies server pagination to the filtered result', () => {
		const page = new PublicCatalogService().list({
			page: 2,
			perPage: 1,
			filters: { categoryId: root!.id }
		});
		expect(page).toMatchObject({ total: 2, page: 2, perPage: 1 });
		expect(page.rows.map((row) => row.id)).toEqual([noPhoto]);
		expect(
			new PublicCatalogService().list({ page: 1, perPage: 25, filters: { categoryId: 999999 } })
				.rows
		).toEqual([]);
	});

	it('does not select prices, cost or stock or expose them in the payload', () => {
		const prepare = vi.spyOn(sqlite, 'prepare');
		try {
			const page = new PublicCatalogService().list({ page: 1, perPage: 25, sort: 'price' });
			const queries = prepare.mock.calls.map(([query]) => query).join('\n');
			expect(page.rows).toHaveLength(3);
			expect(queries).not.toMatch(/price|cost|stock|select\s+\*/i);
			expect(JSON.stringify(page)).not.toMatch(/price|cost|stock|minor|123456|98765/i);
		} finally {
			prepare.mockRestore();
		}
	});

	it('normalizes malformed paging without removing the page limit', () => {
		const page = new PublicCatalogService().list({ page: Number.NaN, perPage: Number.NaN });
		expect(page).toMatchObject({ total: 3, page: 1, perPage: 25 });
	});
});
