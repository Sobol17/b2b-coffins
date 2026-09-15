import { z } from 'zod';
import { STAFF_STATUSES } from '$lib/types/counterparty';
import { PORTAL_ROLES } from '$lib/types/roles';
import { fullNameSchema, phoneSchema } from './contact';

const memberId = z.coerce.number().int().positive();

/** New portal account. The counterparty never comes from the form: it is the administrator's own. */
export const createStaffSchema = z.object({
	fullName: fullNameSchema,
	// Stored lower-cased: the login form and the uniqueness check must agree on one spelling.
	email: z
		.string()
		.trim()
		.toLowerCase()
		.pipe(z.email({ error: 'Введите адрес электронной почты' })),
	phone: phoneSchema,
	role: z.enum(PORTAL_ROLES, { error: 'Выберите роль' })
});

export const staffMemberSchema = z.object({ id: memberId });

export const staffRoleSchema = z.object({ id: memberId, role: z.enum(PORTAL_ROLES) });

/** Filters from the query string. A tampered value is dropped, not turned into a 422 page. */
export const staffFiltersSchema = z.object({
	role: z.enum(PORTAL_ROLES).optional().catch(undefined),
	status: z.enum(STAFF_STATUSES).optional().catch(undefined)
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
