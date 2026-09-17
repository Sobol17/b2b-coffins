import { z } from 'zod';

/** One or two letters match half the catalog, and a long query is never a real title. */
export const siteSearchQuerySchema = z.object({
	q: z.string().trim().min(2).max(64)
});
