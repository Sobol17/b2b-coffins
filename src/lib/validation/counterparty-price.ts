import { z } from 'zod';
import { PERSONAL_PRICE_MAX_MINOR } from '$lib/domain/pricing/personal-price';

/** One row of the «Цены» tab. Zero clears the price, so an emptied field is not an error. */
export const personalPriceEntrySchema = z.object({
	variantId: z.coerce.number().int().positive(),
	priceMinor: z.coerce
		.number({ error: 'Введите сумму в рублях' })
		.int({ error: 'Введите сумму в рублях' })
		.min(0, { error: 'Цена не может быть отрицательной' })
		.max(PERSONAL_PRICE_MAX_MINOR, { error: 'Слишком большая цена' })
		// The money field takes whole rubles; a crafted form must not store kopecks behind it.
		.multipleOf(100, { error: 'Введите цену в целых рублях' })
});

/** The tab submits every visible row at once; the bound matches MAX_PER_PAGE of core/list. */
export const personalPricePageSchema = z.object({
	entries: z.array(personalPriceEntrySchema).min(1).max(200)
});

/** Filters from the query string, keys prefixed with `price`. A tampered value is dropped. */
export const personalPriceFiltersSchema = z.object({
	priceSearch: z.string().trim().max(64).optional().catch(undefined),
	priceCategory: z.coerce.number().int().positive().optional().catch(undefined)
});

export type PersonalPriceEntryInput = z.infer<typeof personalPriceEntrySchema>;

/** Form field names carry the variant: `price:42`. Reading them here keeps the route thin. */
export function personalPriceEntriesFrom(
	form: FormData
): { variantId: number; priceMinor: number }[] {
	const entries: { variantId: number; priceMinor: number }[] = [];
	for (const [key, value] of form.entries()) {
		const match = /^price:(\d+)$/.exec(key);
		if (match) entries.push({ variantId: Number(match[1]), priceMinor: Number(value) });
	}
	return entries;
}
