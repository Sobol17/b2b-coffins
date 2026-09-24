import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { categories, media, productVariants, products } from '../db/schema';
import type { CrmCategoryDto, CrmMediaDto, CrmProductListItemDto } from '$lib/types/crm-catalog';
import type { CategoryInput, ProductInput } from '$lib/validation/crm-catalog';

const PRODUCT = {
	id: products.id,
	sku: products.sku,
	title: products.title,
	categoryId: products.categoryId,
	description: products.description,
	isPublished: products.isPublished,
	sortOrder: products.sortOrder,
	deletedAt: products.deletedAt
};

export type ManagedProductRow =
	ReturnType<ProductRepository['findProduct']> extends infer T ? NonNullable<T> : never;

/** CRM writes and projections for categories and product models. */
export class ProductRepository extends BaseRepository<typeof products> {
	constructor() {
		super(products);
	}

	categories(tx?: Tx): CrmCategoryDto[] {
		return this.db(tx)
			.select({
				id: categories.id,
				title: categories.title,
				parentId: categories.parentId,
				sortOrder: categories.sortOrder
			})
			.from(categories)
			.orderBy(asc(categories.sortOrder), asc(categories.id))
			.all();
	}

	category(id: number, tx?: Tx): CrmCategoryDto | undefined {
		return this.categories(tx).find((row) => row.id === id);
	}

	insertCategory(input: CategoryInput, tx: Tx): number {
		const [row] = this.db(tx)
			.insert(categories)
			.values(input)
			.returning({ id: categories.id })
			.all();
		if (!row) throw new Error('failed to insert category');
		return row.id;
	}

	updateCategory(id: number, input: CategoryInput, tx: Tx): void {
		this.db(tx).update(categories).set(input).where(eq(categories.id, id)).run();
	}

	deleteCategory(id: number, tx: Tx): void {
		this.db(tx).delete(categories).where(eq(categories.id, id)).run();
	}

	categoryUsed(id: number, tx: Tx): boolean {
		const child = this.db(tx)
			.select({ id: categories.id })
			.from(categories)
			.where(eq(categories.parentId, id))
			.get();
		const product = this.db(tx)
			.select({ id: products.id })
			.from(products)
			.where(eq(products.categoryId, id))
			.get();
		return child !== undefined || product !== undefined;
	}

	listProducts(tx?: Tx): CrmProductListItemDto[] {
		const rows = this.db(tx)
			.select(PRODUCT)
			.from(products)
			.orderBy(asc(products.sortOrder), asc(products.id))
			.all();
		return rows.map((row) => {
			const variants = this.db(tx)
				.select({ id: productVariants.id })
				.from(productVariants)
				.where(and(eq(productVariants.productId, row.id), isNull(productVariants.deletedAt)))
				.all();
			return {
				id: row.id,
				sku: row.sku,
				title: row.title,
				categoryId: row.categoryId,
				isPublished: row.isPublished,
				isDeleted: row.deletedAt !== null,
				variantCount: variants.length,
				coverMediaId: this.media(row.id, tx)[0]?.id ?? null
			};
		});
	}

	findProduct(id: number, tx?: Tx) {
		return this.db(tx).select(PRODUCT).from(products).where(eq(products.id, id)).get();
	}

	skuTaken(sku: string, exceptId?: number, tx?: Tx): boolean {
		return (
			this.db(tx)
				.select({ id: products.id })
				.from(products)
				.where(
					and(eq(products.sku, sku), exceptId === undefined ? undefined : ne(products.id, exceptId))
				)
				.get() !== undefined
		);
	}

	insertProduct(input: ProductInput, tx: Tx): number {
		const [row] = this.db(tx).insert(products).values(input).returning({ id: products.id }).all();
		if (!row) throw new Error('failed to insert product');
		return row.id;
	}

	updateProduct(id: number, input: ProductInput, tx: Tx): void {
		this.db(tx).update(products).set(input).where(eq(products.id, id)).run();
	}

	setProductPublished(id: number, isPublished: boolean, tx: Tx): void {
		this.db(tx).update(products).set({ isPublished }).where(eq(products.id, id)).run();
	}

	softDeleteProduct(id: number, tx: Tx): void {
		this.db(tx)
			.update(products)
			.set({ isPublished: false, deletedAt: new Date() })
			.where(eq(products.id, id))
			.run();
	}

	media(productId: number, tx?: Tx): CrmMediaDto[] {
		return this.db(tx)
			.select({ id: media.id, sortOrder: media.sortOrder })
			.from(media)
			.where(and(eq(media.ownerScope, 'product'), eq(media.ownerId, productId)))
			.orderBy(asc(media.sortOrder), asc(media.id))
			.all()
			.map((row, index) => ({ ...row, isCover: index === 0 }));
	}
}
