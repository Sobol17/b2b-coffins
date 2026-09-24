import { z } from 'zod';
import { SHOP_PRODUCE_MAX } from '$lib/types/crm-shop';

const id = z.coerce.number().int().positive();

/** One production mark of the shop floor: a position and the pieces made (tech.md v1.41). */
export const shopProduceSchema = z.object({
	variantId: id,
	// An empty field is the colourless position of the variant, not a missing value.
	optionId: z.preprocess(
		(value) => (value === '' || value === undefined ? null : value),
		id.nullable()
	),
	qty: z.coerce
		.number({ error: 'Укажите количество' })
		.int({ error: 'Количество должно быть целым' })
		.min(1, { error: 'Не меньше одной штуки' })
		.max(SHOP_PRODUCE_MAX, { error: `Не больше ${SHOP_PRODUCE_MAX} штук за раз` })
});
export type ShopProduceInput = z.infer<typeof shopProduceSchema>;

export const shopAssembleSchema = z.object({ requestId: id });

/** The number search of the shop. A tampered value is dropped, not turned into a 422 page. */
export const shopSearchSchema = z
	.string()
	.trim()
	.max(32)
	.optional()
	.catch(undefined)
	.transform((value) => (value === '' ? undefined : value));
