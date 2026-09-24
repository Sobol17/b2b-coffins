import { PolicyService } from '../auth/policy';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../core/errors';
import { BaseService } from '../core/service';
import type { Tx } from '../db/client';
import { ProductRepository } from './product.repository';
import { ManagedOptionRepository } from './option.repository';
import { ManagedVariantRepository } from './variant.repository';
import type { ActorContext } from '$lib/types/actor';
import type { CrmOptionDto, CrmVariantDto } from '$lib/types/crm-catalog';
import {
	compatibilityInputSchema,
	type CompatibilityInput,
	type OptionInput,
	type VariantInput
} from '$lib/validation/crm-catalog';

/** Variant and colour writes shared by the catalog service. */
export class CrmVariantService extends BaseService {
	constructor(
		ctx: ActorContext,
		protected readonly variants: ManagedVariantRepository = new ManagedVariantRepository(),
		protected readonly options: ManagedOptionRepository = new ManagedOptionRepository(),
		protected readonly products: ProductRepository = new ProductRepository()
	) {
		super(ctx);
		this.assert(ctx.scope === 'crm' && PolicyService.can(ctx, 'catalog.manage'), 'catalog.manage');
	}

	listOptions(): CrmOptionDto[] {
		return this.options.list();
	}

	createVariant(input: VariantInput): CrmVariantDto {
		this.guardCost(input);
		return this.audited({ action: 'catalog.variant.create', entity: 'product_variants' }, (tx) => {
			this.validateVariant(input, undefined, tx);
			const id = this.variants.insert(input, tx);
			return {
				result: this.requireVariant(id, tx),
				entityId: id,
				after: { sku: input.sku, productId: input.productId }
			};
		});
	}

	updateVariant(id: number, input: VariantInput): CrmVariantDto {
		this.guardCost(input);
		return this.audited({ action: 'catalog.variant.update', entity: 'product_variants' }, (tx) => {
			const old = this.requireVariant(id, tx);
			if (old.isDeleted || old.productId !== input.productId)
				throw new ConflictError('Вариант нельзя перенести в другую модель');
			this.validateVariant(input, id, tx);
			this.variants.update(id, input, tx);
			return {
				result: this.requireVariant(id, tx),
				entityId: id,
				before: { sku: old.sku, isPublished: old.isPublished },
				after: { sku: input.sku, isPublished: input.isPublished }
			};
		});
	}

	setVariantPublished(id: number, isPublished: boolean): CrmVariantDto {
		return this.audited(
			{
				action: isPublished ? 'catalog.variant.publish' : 'catalog.variant.hide',
				entity: 'product_variants'
			},
			(tx) => {
				const old = this.requireVariant(id, tx);
				if (old.isDeleted) throw new ConflictError('Удалённый вариант нельзя опубликовать');
				if (!isPublished) this.guardLastVariant(old, tx);
				this.variants.setPublished(id, isPublished, tx);
				return {
					result: this.requireVariant(id, tx),
					entityId: id,
					before: { isPublished: old.isPublished },
					after: { isPublished }
				};
			}
		);
	}

	deleteVariant(id: number): void {
		this.audited({ action: 'catalog.variant.delete', entity: 'product_variants' }, (tx) => {
			const old = this.requireVariant(id, tx);
			if (old.isDeleted) throw new ConflictError('Вариант уже удалён');
			this.guardLastVariant(old, tx);
			this.variants.softDelete(id, tx);
			return {
				result: undefined,
				entityId: id,
				before: { isPublished: old.isPublished },
				after: { isDeleted: true }
			};
		});
	}

	createOption(input: OptionInput): CrmOptionDto {
		return this.audited({ action: 'catalog.option.create', entity: 'options' }, (tx) => {
			this.validateOption(input, tx);
			const id = this.options.insert(input, tx);
			return { result: this.requireOption(id, tx), entityId: id, after: { title: input.title } };
		});
	}

	updateOption(id: number, input: OptionInput): CrmOptionDto {
		return this.audited({ action: 'catalog.option.update', entity: 'options' }, (tx) => {
			const old = this.requireOption(id, tx);
			this.validateOption(input, tx);
			this.options.update(id, input, tx);
			return {
				result: this.requireOption(id, tx),
				entityId: id,
				before: { title: old.title },
				after: { title: input.title }
			};
		});
	}

	setOptionActive(id: number, isActive: boolean): CrmOptionDto {
		return this.audited(
			{ action: isActive ? 'catalog.option.enable' : 'catalog.option.disable', entity: 'options' },
			(tx) => {
				const old = this.requireOption(id, tx);
				this.options.setActive(id, isActive, tx);
				return {
					result: this.requireOption(id, tx),
					entityId: id,
					before: { isActive: old.isActive },
					after: { isActive }
				};
			}
		);
	}

	setCompatibility(input: CompatibilityInput): CrmVariantDto {
		const parsed = compatibilityInputSchema.safeParse(input);
		if (!parsed.success) throw new ValidationError('Проверьте матрицу цветов');
		return this.audited(
			{ action: 'catalog.compatibility.update', entity: 'product_options' },
			(tx) => {
				const variant = this.requireVariant(input.variantId, tx);
				if (variant.isDeleted) throw new ConflictError('Вариант удалён');
				const ids = input.options.map((row) => row.optionId);
				if (this.options.activeIds(ids, tx).size !== ids.length)
					throw new ValidationError('В матрице есть выключенный цвет');
				const before = this.variants.compatibility(input.variantId, tx);
				this.variants.setCompatibility(input, tx);
				return {
					result: this.requireVariant(input.variantId, tx),
					entityId: input.variantId,
					before: { options: before },
					after: { options: input.options }
				};
			}
		);
	}

	protected requireVariant(id: number, tx: Tx): CrmVariantDto {
		const row = this.variants.find(id, tx);
		if (!row) throw new NotFoundError('variant');
		const variant = this.variants
			.variants(row.productId, this.ctx.canSeeCost, tx)
			.find((item) => item.id === id);
		if (!variant) throw new NotFoundError('variant');
		return variant;
	}

	private requireOption(id: number, tx: Tx): CrmOptionDto {
		const row = this.options.find(id, tx);
		if (!row) throw new NotFoundError('option');
		return row;
	}

	private validateVariant(input: VariantInput, exceptId: number | undefined, tx: Tx): void {
		const product = this.products.findProduct(input.productId, tx);
		if (!product || product.deletedAt) throw new ValidationError('Модель не найдена');
		if (!this.variants.materialActive(input.materialId, tx))
			throw new ValidationError('Выберите действующий материал');
		if (input.stockItemId !== null && !this.variants.stockProductActive(input.stockItemId, tx))
			throw new ValidationError('Выберите учётную позицию изделия');
		if (this.variants.skuTaken(input.sku, exceptId, tx))
			throw new ValidationError('Артикул варианта уже занят');
	}

	private validateOption(input: OptionInput, tx: Tx): void {
		if (input.priceDeltaMinor !== 0) throw new ValidationError('Цвет не меняет цену');
		if (input.stockItemId !== null && !this.variants.stockComponentActive(input.stockItemId, tx))
			throw new ValidationError('Выберите учётную позицию комплектующего');
	}

	private guardCost(input: VariantInput): void {
		if (input.costPriceMinor !== undefined && !PolicyService.can(this.ctx, 'catalog.cost.read')) {
			throw new ForbiddenError('catalog.cost.read');
		}
	}

	private guardLastVariant(old: CrmVariantDto, tx: Tx): void {
		if (!old.isPublished) return;
		const product = this.products.findProduct(old.productId, tx);
		if (product?.isPublished && this.variants.activeCount(old.productId, old.id, tx) === 0) {
			throw new ConflictError('Сначала скройте модель');
		}
	}
}
