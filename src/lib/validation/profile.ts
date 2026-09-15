import { z } from 'zod';

/**
 * Own account of a portal user. E-mail is absent on purpose: it is the login, and only the
 * workshop changes it. Unknown keys are stripped, so a crafted `email` field is ignored.
 */
export const updateProfileSchema = z.object({
	fullName: z
		.string()
		.trim()
		.min(2, { error: 'Укажите имя и фамилию' })
		.max(120, { error: 'Не длиннее 120 символов' }),
	phone: z
		.string()
		.trim()
		.regex(/^$|^\+?[\d\s()-]{5,31}$/, { error: 'Телефон: цифры, пробелы, скобки и дефис' })
		.transform((value) => (value === '' ? null : value))
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
