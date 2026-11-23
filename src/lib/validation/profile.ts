import { accountPhoneSchema } from './contact';
import { z } from 'zod';

/** Only the workshop edits email; account phone is required and normalized. */
export const updateProfileSchema = z.object({
	fullName: z
		.string()
		.trim()
		.min(2, { error: 'Укажите имя и фамилию' })
		.max(120, { error: 'Не длиннее 120 символов' }),
	phone: accountPhoneSchema
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
