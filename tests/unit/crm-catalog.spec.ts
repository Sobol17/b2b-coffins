import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { PolicyService } from '../../src/lib/server/auth/policy';
import { CrmCatalogService } from '../../src/lib/server/crm-catalog/crm-catalog.service';
import { ConflictError, ForbiddenError, ValidationError } from '../../src/lib/server/core/errors';
import { auditLog, dictItems, productVariants, products } from '../../src/lib/server/db/schema';
import { CatalogService } from '../../src/lib/server/catalog/catalog.service';
import type { ActorContext } from '../../src/lib/types/actor';
import type { RoleCode } from '../../src/lib/types/roles';
import { insertUser, migratedDatabase } from './helpers/db';

const db = migratedDatabase();
let ownerId = 0;
let materialId = 0;

function actor(role: RoleCode): ActorContext {
	const roles = [role];
	return {
		userId: ownerId,
		roles,
		scope: PolicyService.scopeOf(roles),
		counterpartyId: role === 'cp_admin' ? 1 : null,
		canSeePrices: PolicyService.canSeePrices(roles),
		canSeeCost: PolicyService.canSeeCost(roles),
		requestId: 'c2-test'
	};
}

beforeAll(() => {
	ownerId = insertUser({ email: 'c2.owner@example.test', role: 'owner', counterpartyId: null });
	const [material] = db
		.insert(dictItems)
		.values({ dict: 'material', code: 'c2-oak', title: 'Дуб' })
		.returning()
		.all();
	materialId = material?.id ?? 0;
});

describe('C2 catalog from an empty database', () => {
	it('creates a category, model, variant and colour without a seed, then publishes to the portal', () => {
		const service = new CrmCatalogService(actor('owner'));
		const category = service.createCategory({ title: 'Гробы C2', parentId: null, sortOrder: 0 });
		const product = service.createProduct({
			sku: 'C2-MODEL',
			title: 'Модель C2',
			categoryId: category.id,
			description: null,
			sortOrder: 0,
			isPublished: false
		});
		const variant = service.createVariant({
			productId: product.id,
			sku: 'C2-VARIANT',
			sizeCode: '190',
			materialId,
			lengthMm: 1900,
			widthMm: null,
			heightMm: null,
			weightG: null,
			basePriceMinor: 100000,
			costPriceMinor: 50000,
			stockItemId: null,
			isPublished: true
		});
		const option = service.createOption({
			title: 'Красный C2',
			priceDeltaMinor: 0,
			stockItemId: null,
			isActive: true
		});
		service.setCompatibility({
			variantId: variant.id,
			options: [{ optionId: option.id, isDefault: true }]
		});
		expect(() => new CatalogService(actor('cp_admin')).get(product.id)).toThrow();
		service.setProductPublished(product.id, true);
		const portal = new CatalogService(actor('cp_admin')).get(product.id);
		expect(portal.variants[0]?.options[0]?.id).toBe(option.id);
		expect(portal.variants[0]).not.toHaveProperty('costPriceMinor');
		expect(service.getProduct(product.id).variants[0]?.costPriceMinor).toBe(50000);
		expect(() =>
			service.updateVariant(variant.id, {
				productId: product.id,
				sku: variant.sku,
				sizeCode: variant.sizeCode,
				materialId,
				lengthMm: variant.lengthMm,
				widthMm: variant.widthMm,
				heightMm: variant.heightMm,
				weightG: variant.weightG,
				basePriceMinor: variant.basePriceMinor,
				costPriceMinor: 50000,
				stockItemId: null,
				isPublished: false
			})
		).toThrow(ConflictError);
		service.setProductPublished(product.id, false);
		expect(() => new CatalogService(actor('cp_admin')).get(product.id)).toThrow();
		expect(
			db.select().from(auditLog).where(eq(auditLog.entity, 'products')).all().length
		).toBeGreaterThan(0);
	});

	it('does not select or return cost for a manager, and rejects a forged cost write', () => {
		const owner = new CrmCatalogService(actor('owner'));
		const manager = new CrmCatalogService(actor('manager'));
		const product = owner.listProducts()[0];
		expect(product).toBeDefined();
		const detail = manager.getProduct(product?.id ?? 0);
		expect(JSON.stringify(detail)).not.toContain('costPriceMinor');
		const variant = detail.variants[0];
		expect(variant).toBeDefined();
		expect(() =>
			manager.updateVariant(variant?.id ?? 0, {
				productId: product?.id ?? 0,
				sku: 'C2-VARIANT',
				sizeCode: '190',
				materialId,
				lengthMm: 1900,
				widthMm: null,
				heightMm: null,
				weightG: null,
				basePriceMinor: 100000,
				costPriceMinor: 1,
				stockItemId: null,
				isPublished: true
			})
		).toThrow(ForbiddenError);
		expect(
			db
				.select({ cost: productVariants.costPriceMinor })
				.from(productVariants)
				.where(eq(productVariants.id, variant?.id ?? 0))
				.all()[0]?.cost
		).toBe(50000);
	});

	it('validates references and blocks matrix entries for inactive colours', () => {
		const service = new CrmCatalogService(actor('owner'));
		expect(() =>
			service.createProduct({
				sku: 'C2-BAD',
				title: 'Bad',
				categoryId: 999999,
				description: null,
				sortOrder: 0,
				isPublished: false
			})
		).toThrow(ValidationError);
		const detail = service.getProduct(service.listProducts()[0]?.id ?? 0);
		const option = service.listOptions().find((row) => row.title === 'Красный C2');
		service.setOptionActive(option?.id ?? 0, false);
		expect(() =>
			service.setCompatibility({
				variantId: detail.variants[0]?.id ?? 0,
				options: [{ optionId: option?.id ?? 0, isDefault: true }]
			})
		).toThrow(ValidationError);
	});

	it('denies portal actors every management method', () => {
		expect(() => new CrmCatalogService(actor('cp_admin'))).toThrow(ForbiddenError);
		expect(db.select().from(products).all()).toHaveLength(1);
	});
});
