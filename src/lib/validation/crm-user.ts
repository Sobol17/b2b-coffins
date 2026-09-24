import { z } from 'zod';
import { STAFF_STATUSES } from '$lib/types/counterparty';
import { CRM_ROLES } from '$lib/types/roles';
import { fullNameSchema, phoneSchema } from './contact';

const userId = z.coerce.number().int().positive();

// A workshop account may hold several roles: the owner who also drives, the painter who also saws.
const crmRoles = z
	.array(z.enum(CRM_ROLES), { error: 'Выберите роль' })
	.min(1, { error: 'Выберите хотя бы одну роль' })
	.transform((roles) => [...new Set(roles)]);

/** New workshop account. The contour is always the CRM: a portal account belongs to a counterparty. */
export const createCrmUserSchema = z.object({
	fullName: fullNameSchema,
	// Stored lower-cased: the login form and the uniqueness check must agree on one spelling.
	email: z
		.string()
		.trim()
		.toLowerCase()
		.pipe(z.email({ error: 'Введите адрес электронной почты' })),
	phone: phoneSchema,
	roles: crmRoles
});

export const crmUserIdSchema = z.object({ id: userId });

export const crmUserRolesSchema = z.object({ id: userId, roles: crmRoles });

/** Filters from the query string. A tampered value is dropped, not turned into a 422 page. */
export const crmUserFiltersSchema = z.object({
	role: z.enum(CRM_ROLES).optional().catch(undefined),
	status: z.enum(STAFF_STATUSES).optional().catch(undefined)
});

/** `roles` arrives as repeated checkbox fields, which `Object.fromEntries` would collapse to one. */
export function crmUserFormFields(form: FormData): Record<string, unknown> {
	return { ...Object.fromEntries(form), roles: form.getAll('roles') };
}

export type CreateCrmUserInput = z.infer<typeof createCrmUserSchema>;
