import { z } from 'zod';

/** Catalog filters from the query string. One schema for the storefront route (P3) and its tests. */
export const catalogFiltersSchema = z.object({
	categoryId: z.coerce.number().int().positive().optional()
});

export const productIdSchema = z.coerce.number().int().positive();
