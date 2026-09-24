import { ConflictError, NotFoundError, ValidationError } from '../core/errors';
import type { Tx } from '../db/client';
import { CrmVariantService } from './variant.service';
import type {
	CrmCatalogChoicesDto,
	CrmCategoryDto,
	CrmProductDto,
	CrmProductListItemDto
} from '$lib/types/crm-catalog';
import type { CategoryInput, ProductInput } from '$lib/validation/crm-catalog';

/** Catalog management for the workshop. The portal still reads the existing CatalogService. */
export class CrmCatalogService extends CrmVariantService {
	choices(): CrmCatalogChoicesDto {
		return this.variants.choices();
	}

	listCategories(): CrmCategoryDto[] {
		return this.products.categories();
	}

	createCategory(input: CategoryInput): CrmCategoryDto {
		return this.audited({ action: 'catalog.category.create', entity: 'categories' }, (tx) => {
			this.validateParent(input.parentId, undefined, tx);
			const id = this.products.insertCategory(input, tx);
			return {
				result: this.requireCategory(id, tx),
				entityId: id,
				after: { title: input.title, parentId: input.parentId }
			};
		});
	}

	updateCategory(id: number, input: CategoryInput): CrmCategoryDto {
		return this.audited({ action: 'catalog.category.update', entity: 'categories' }, (tx) => {
			const old = this.requireCategory(id, tx);
			this.validateParent(input.parentId, id, tx);
			this.products.updateCategory(id, input, tx);
			return {
				result: this.requireCategory(id, tx),
				entityId: id,
				before: { title: old.title, parentId: old.parentId },
				after: { title: input.title, parentId: input.parentId }
			};
		});
	}

	deleteCategory(id: number): void {
		this.audited({ action: 'catalog.category.delete', entity: 'categories' }, (tx) => {
			const old = this.requireCategory(id, tx);
			if (this.products.categoryUsed(id, tx))
				throw new ConflictError('Категория содержит модели или разделы');
			this.products.deleteCategory(id, tx);
			return {
				result: undefined,
				entityId: id,
				before: { title: old.title },
				after: { deleted: true }
			};
		});
	}

	listProducts(): CrmProductListItemDto[] {
		return this.products.listProducts();
	}

	getProduct(id: number): CrmProductDto {
		const row = this.products.findProduct(id);
		if (!row) throw new NotFoundError('product');
		return this.projectProduct(id);
	}

	createProduct(input: ProductInput): CrmProductDto {
		return this.audited({ action: 'catalog.product.create', entity: 'products' }, (tx) => {
			this.validateProduct(input, undefined, tx);
			const id = this.products.insertProduct(input, tx);
			return {
				result: this.projectProduct(id, tx),
				entityId: id,
				after: { sku: input.sku, categoryId: input.categoryId }
			};
		});
	}

	updateProduct(id: number, input: ProductInput): CrmProductDto {
		return this.audited({ action: 'catalog.product.update', entity: 'products' }, (tx) => {
			const old = this.requireProduct(id, tx);
			if (old.deletedAt) throw new ConflictError('Модель удалена');
			this.validateProduct(input, id, tx);
			this.products.updateProduct(id, input, tx);
			return {
				result: this.projectProduct(id, tx),
				entityId: id,
				before: { sku: old.sku, isPublished: old.isPublished },
				after: { sku: input.sku, isPublished: input.isPublished }
			};
		});
	}

	setProductPublished(id: number, isPublished: boolean): CrmProductDto {
		return this.audited(
			{
				action: isPublished ? 'catalog.product.publish' : 'catalog.product.hide',
				entity: 'products'
			},
			(tx) => {
				const old = this.requireProduct(id, tx);
				if (old.deletedAt) throw new ConflictError('Модель удалена');
				if (isPublished && this.variants.activeCount(id, undefined, tx) === 0) {
					throw new ValidationError('Опубликуйте хотя бы один вариант');
				}
				this.products.setProductPublished(id, isPublished, tx);
				return {
					result: this.projectProduct(id, tx),
					entityId: id,
					before: { isPublished: old.isPublished },
					after: { isPublished }
				};
			}
		);
	}

	deleteProduct(id: number): void {
		this.audited({ action: 'catalog.product.delete', entity: 'products' }, (tx) => {
			const old = this.requireProduct(id, tx);
			if (old.deletedAt) throw new ConflictError('Модель уже удалена');
			this.products.softDeleteProduct(id, tx);
			return {
				result: undefined,
				entityId: id,
				before: { isPublished: old.isPublished },
				after: { isDeleted: true }
			};
		});
	}

	private requireCategory(id: number, tx: Tx): CrmCategoryDto {
		const row = this.products.category(id, tx);
		if (!row) throw new NotFoundError('category');
		return row;
	}

	private requireProduct(id: number, tx: Tx) {
		const row = this.products.findProduct(id, tx);
		if (!row) throw new NotFoundError('product');
		return row;
	}

	private validateParent(parentId: number | null, selfId: number | undefined, tx: Tx): void {
		if (parentId === null) return;
		const byId = new Map(this.products.categories(tx).map((row) => [row.id, row]));
		if (!byId.has(parentId)) throw new ValidationError('Родительская категория не найдена');
		for (let id: number | null = parentId; id !== null; id = byId.get(id)?.parentId ?? null) {
			if (id === selfId) throw new ValidationError('Категория не может быть своим потомком');
		}
	}

	private validateProduct(input: ProductInput, exceptId: number | undefined, tx: Tx): void {
		if (!this.products.category(input.categoryId, tx))
			throw new ValidationError('Выберите категорию');
		if (this.products.skuTaken(input.sku, exceptId, tx))
			throw new ValidationError('Артикул модели уже занят');
		if (
			input.isPublished &&
			(exceptId === undefined || this.variants.activeCount(exceptId, undefined, tx) === 0)
		) {
			throw new ValidationError('Опубликуйте хотя бы один вариант');
		}
	}

	private projectProduct(id: number, tx?: Tx): CrmProductDto {
		const row = this.products.findProduct(id, tx);
		if (!row) throw new NotFoundError('product');
		return {
			id: row.id,
			sku: row.sku,
			title: row.title,
			categoryId: row.categoryId,
			description: row.description,
			isPublished: row.isPublished,
			isDeleted: row.deletedAt !== null,
			sortOrder: row.sortOrder,
			media: this.products.media(id, tx),
			variants: this.variants.variants(id, this.ctx.canSeeCost, tx)
		};
	}
}
