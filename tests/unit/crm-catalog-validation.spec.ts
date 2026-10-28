import { describe, expect, it } from 'vitest';
import {
	categoryInputSchema,
	productInputSchema,
	variantInputSchema,
	optionInputSchema,
	compatibilityInputSchema,
	priceListInputSchema,
	discountRuleInputSchema
} from '../../src/lib/validation/crm-catalog';

describe('C2 server form contracts', () => {
	it('requires a category and a real SKU for a model', () => {
		expect(
			categoryInputSchema.safeParse({ title: 'Гробы', parentId: '', sortOrder: '0' }).success
		).toBe(true);
		expect(
			productInputSchema.safeParse({ sku: '', title: 'Модель', categoryId: '1' }).success
		).toBe(false);
		expect(
			productInputSchema.safeParse({ sku: 'MODEL-1', title: 'Модель', categoryId: '0' }).success
		).toBe(false);
	});

	it('keeps variant money in whole rubles and leaves the cost to the stock item', () => {
		const base = {
			productId: '1',
			sku: 'V-1',
			sizeCode: '190',
			materialId: '2',
			basePriceMinor: '10000',
			costPriceMinor: '5000',
			stockItemId: ''
		};
		const parsed = variantInputSchema.parse(base);
		expect(parsed).toMatchObject({ basePriceMinor: 10000, stockItemId: null });
		// The form of v1.62 has no cost: a forged field never reaches the variant.
		expect(parsed).not.toHaveProperty('costPriceMinor');
		expect(variantInputSchema.safeParse({ ...base, basePriceMinor: '10001' }).success).toBe(false);
		expect(optionInputSchema.safeParse({ title: 'Красный', priceDeltaMinor: '1' }).success).toBe(
			false
		);
	});

	it('rejects duplicate compatible colours and multiple defaults', () => {
		const base = { variantId: 1, options: [{ optionId: 3, isDefault: true }] };
		expect(compatibilityInputSchema.safeParse(base).success).toBe(true);
		expect(
			compatibilityInputSchema.safeParse({ ...base, options: [...base.options, ...base.options] })
				.success
		).toBe(false);
		expect(
			compatibilityInputSchema.safeParse({
				...base,
				options: [
					{ optionId: 3, isDefault: true },
					{ optionId: 4, isDefault: true }
				]
			}).success
		).toBe(false);
	});

	it('requires ordered, half-open validity windows', () => {
		expect(
			priceListInputSchema.safeParse({
				title: 'Базовый',
				isBase: 'true',
				validFrom: '2026-09-01',
				validTo: '2026-09-01'
			}).success
		).toBe(false);
		expect(
			priceListInputSchema.safeParse({
				title: 'Базовый',
				isBase: 'true',
				validFrom: '2026-09-01',
				validTo: '2026-10-01'
			}).success
		).toBe(true);
		expect(
			discountRuleInputSchema.safeParse({
				counterpartyId: '',
				categoryId: '',
				percent: '101',
				validFrom: '',
				validTo: ''
			}).success
		).toBe(false);
	});
});
