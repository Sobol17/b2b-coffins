import { z } from 'zod';

const blank = (value: unknown) => (value === '' ? undefined : value);

const text = z.preprocess(blank, z.string().trim().max(64).optional()).catch(undefined);
const day = z.preprocess(blank, z.iso.date().optional()).catch(undefined);

/** Filters of the audit journal from the query string. A tampered value is dropped, not a 422. */
export const auditFiltersSchema = z.object({
	actor: text,
	action: text,
	entity: text,
	from: day,
	to: day
});
