import { z } from 'zod';
import { AGENCY_PRICE_MAX_MINOR } from '$lib/domain/pricing/agency-price';

/** One row of the "Мои цены" page. Zero clears the price, so an emptied field is not an error. */
export const agencyPriceEntrySchema = z.object({
	productId: z.coerce.number().int().positive(),
	priceMinor: z.coerce
		.number({ error: 'Введите сумму в рублях' })
		.int({ error: 'Введите сумму в рублях' })
		.min(0, { error: 'Цена не может быть отрицательной' })
		.max(AGENCY_PRICE_MAX_MINOR, { error: 'Слишком большая цена' })
});

/** The page submits every visible row at once; the bound matches the largest page size. */
export const agencyPricePageSchema = z.object({
	entries: z.array(agencyPriceEntrySchema).max(100)
});

/** Filters from the query string. A tampered value is dropped, not turned into a 422 page. */
export const agencyPriceFiltersSchema = z.object({
	categoryId: z.coerce.number().int().positive().optional().catch(undefined)
});

export type AgencyPriceEntryInput = z.infer<typeof agencyPriceEntrySchema>;

/** Form field names carry the model: `price:42`. Reading them here keeps the route thin. */
export function agencyPriceEntriesFrom(
	form: FormData
): { productId: number; priceMinor: number }[] {
	const entries: { productId: number; priceMinor: number }[] = [];
	for (const [key, value] of form.entries()) {
		const match = /^price:(\d+)$/.exec(key);
		if (match) entries.push({ productId: Number(match[1]), priceMinor: Number(value) });
	}
	return entries;
}
