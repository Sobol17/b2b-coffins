import { z } from 'zod';

/** Shape of `settings.org.requisites` (tech.md 5.9). Settings are JSON, so they are parsed on read. */
export const orgRequisitesSchema = z.object({
	name: z.string().min(1),
	phone: z.string().min(1).optional(),
	address: z.string().min(1).optional()
});

export type OrgRequisites = z.infer<typeof orgRequisitesSchema>;
