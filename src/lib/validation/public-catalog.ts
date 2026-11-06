import { z } from 'zod';

/** Invalid URL filters are ignored; valid unknown categories correctly produce an empty page. */
export const publicCatalogFiltersSchema = z.object({
	categoryId: z.coerce.number().int().positive().optional().catch(undefined)
});

export const publicCatalogQuerySchema = z.object({
	page: z.number().int().positive().optional().catch(undefined),
	perPage: z.number().int().positive().max(200).optional().catch(undefined),
	search: z.string().trim().max(200).optional().catch(undefined),
	sort: z.enum(['sortOrder', 'title']).catch('sortOrder'),
	dir: z.enum(['asc', 'desc']).catch('asc'),
	filters: publicCatalogFiltersSchema.optional()
});
