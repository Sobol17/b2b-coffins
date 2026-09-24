import { z } from 'zod';

const id = z.coerce.number().int().positive();
const nullableId = z.preprocess(
	(value) => (value === '' || value == null ? null : value),
	id.nullable()
);
const nullableText = z.preprocess(
	(value) => (value === '' || value == null ? null : value),
	z.string().trim().max(5000).nullable()
);
const optionalNumber = z.preprocess(
	(value) => (value === '' || value == null ? null : value),
	z.coerce.number().int().min(0).nullable()
);
const money = z.coerce.number().int().min(0).max(1_000_000_000_00).multipleOf(100);
const checkbox = z.preprocess(
	(value) => value === true || value === 'true' || value === 'on',
	z.boolean()
);
const sku = z
	.string()
	.trim()
	.toUpperCase()
	.regex(/^[A-Z0-9][A-Z0-9._-]{0,39}$/);
const title = z.string().trim().min(1).max(160);

const day = z.preprocess(
	(value) => (value === '' || value == null ? null : value),
	z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)))
		.nullable()
);
const windowFields = { validFrom: day, validTo: day };
function orderedWindow(value: { validFrom: string | null; validTo: string | null }): boolean {
	return value.validFrom === null || value.validTo === null || value.validFrom < value.validTo;
}

export const categoryInputSchema = z.object({
	title,
	parentId: nullableId,
	sortOrder: z.coerce.number().int().min(0).max(100000)
});

export const productInputSchema = z.object({
	sku,
	title,
	categoryId: id,
	description: nullableText.default(null),
	sortOrder: z.coerce.number().int().min(0).max(100000).default(0),
	isPublished: checkbox.default(false)
});

export const variantInputSchema = z.object({
	productId: id,
	sku,
	sizeCode: z.string().trim().min(1).max(30),
	materialId: id,
	lengthMm: optionalNumber.default(null),
	widthMm: optionalNumber.default(null),
	heightMm: optionalNumber.default(null),
	weightG: optionalNumber.default(null),
	basePriceMinor: money,
	costPriceMinor: z
		.preprocess((value) => (value === '' || value == null ? null : value), money.nullable())
		.optional(),
	stockItemId: nullableId,
	isPublished: checkbox.default(false)
});

export const optionInputSchema = z.object({
	title,
	priceDeltaMinor: z.coerce
		.number()
		.int()
		.refine((value) => value === 0),
	stockItemId: nullableId.default(null),
	isActive: checkbox.default(true)
});

export const compatibilityInputSchema = z
	.object({
		variantId: id,
		options: z.array(z.object({ optionId: id, isDefault: z.boolean() })).max(100)
	})
	.refine(
		(value) => new Set(value.options.map((row) => row.optionId)).size === value.options.length
	)
	.refine((value) => value.options.filter((row) => row.isDefault).length <= 1);

export const priceListInputSchema = z
	.object({
		title,
		isBase: checkbox,
		...windowFields
	})
	.refine(orderedWindow);

export const priceListItemInputSchema = z.object({
	priceListId: id,
	variantId: id,
	priceMinor: money
});

export const discountRuleInputSchema = z
	.object({
		counterpartyId: nullableId,
		categoryId: nullableId,
		percent: z.coerce.number().int().min(1).max(100),
		...windowFields
	})
	.refine(orderedWindow);

export const mediaOrderInputSchema = z
	.object({
		productId: id,
		mediaIds: z.array(id).max(50)
	})
	.refine((value) => new Set(value.mediaIds).size === value.mediaIds.length);

export const entityIdSchema = z.object({ id });
export const statusInputSchema = z.object({ id, isPublished: checkbox });

export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type ProductInput = z.infer<typeof productInputSchema>;
export type VariantInput = z.infer<typeof variantInputSchema>;
export type OptionInput = z.infer<typeof optionInputSchema>;
export type CompatibilityInput = z.infer<typeof compatibilityInputSchema>;
export type PriceListInput = z.infer<typeof priceListInputSchema>;
export type PriceListItemInput = z.infer<typeof priceListItemInputSchema>;
export type DiscountRuleInput = z.infer<typeof discountRuleInputSchema>;
