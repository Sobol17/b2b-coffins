import { beforeAll, describe, expect, it } from 'vitest';
import { PolicyService } from '../../src/lib/server/auth/policy';
import { CrmPricingService } from '../../src/lib/server/crm-pricing/crm-pricing.service';
import { ForbiddenError, ValidationError } from '../../src/lib/server/core/errors';
import { categories, dictItems, productVariants, products } from '../../src/lib/server/db/schema';
import type { ActorContext } from '../../src/lib/types/actor';
import type { RoleCode } from '../../src/lib/types/roles';
import { insertUser, migratedDatabase } from './helpers/db';

const db = migratedDatabase();
let userId = 0;
let variantId = 0;

function actor(role: RoleCode): ActorContext {
	const roles = [role];
	return {
		userId,
		roles,
		scope: PolicyService.scopeOf(roles),
		counterpartyId: role === 'cp_admin' ? 1 : null,
		canSeePrices: PolicyService.canSeePrices(roles),
		canSeeCost: PolicyService.canSeeCost(roles),
		requestId: 'pricing-c2'
	};
}

beforeAll(() => {
	userId = insertUser({ email: 'pricing.c2@example.test', role: 'owner', counterpartyId: null });
	const [category] = db.insert(categories).values({ title: 'C2' }).returning().all();
	const [material] = db
		.insert(dictItems)
		.values({ dict: 'material', code: 'c2-pricing', title: 'Материал' })
		.returning()
		.all();
	const [product] = db
		.insert(products)
		.values({ sku: 'C2-PRICE', title: 'Модель', categoryId: category?.id })
		.returning()
		.all();
	const [variant] = db
		.insert(productVariants)
		.values({
			productId: product?.id ?? 0,
			sku: 'C2-PRICE-V',
			sizeCode: '190',
			materialId: material?.id ?? 0
		})
		.returning()
		.all();
	variantId = variant?.id ?? 0;
});

describe('C2 CRM pricing', () => {
	it('manages a base price list and refuses overlapping base windows', () => {
		const service = new CrmPricingService(actor('manager'));
		const base = service.createPriceList({
			title: 'Осень',
			isBase: true,
			validFrom: '2026-09-01',
			validTo: '2026-10-01'
		});
		service.upsertPriceItem({ priceListId: base.id, variantId, priceMinor: 120000 });
		expect(service.getPriceList(base.id).items).toEqual([{ variantId, priceMinor: 120000 }]);
		expect(() =>
			service.createPriceList({
				title: 'Пересечение',
				isBase: true,
				validFrom: '2026-09-30',
				validTo: null
			})
		).toThrow(ValidationError);
		expect(
			service.createPriceList({
				title: 'Зима',
				isBase: true,
				validFrom: '2026-10-01',
				validTo: null
			}).id
		).toBeGreaterThan(base.id);
	});

	it('manages dated discount rules and rejects portal writes', () => {
		const service = new CrmPricingService(actor('owner'));
		const rule = service.createDiscountRule({
			counterpartyId: null,
			categoryId: null,
			percent: 8,
			validFrom: '2026-09-01',
			validTo: '2026-10-01'
		});
		expect(service.listDiscountRules()).toContainEqual(rule);
		expect(() => new CrmPricingService(actor('cp_admin'))).toThrow(ForbiddenError);
	});
});
