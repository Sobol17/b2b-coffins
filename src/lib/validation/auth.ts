import { z } from 'zod';

/**
 * Password policy from tech.md 12. One schema serves the login form, the change form and the
 * contract test, so "field is required" is not written down three times.
 */
export const passwordSchema = z
	.string()
	.min(12, { error: 'Пароль короче 12 символов' })
	.max(128)
	.refine((v) => /[a-zа-я]/.test(v), { error: 'Нужна строчная буква' })
	.refine((v) => /[A-ZА-Я]/.test(v), { error: 'Нужна заглавная буква' })
	.refine((v) => /\d/.test(v), { error: 'Нужна цифра' });

export const loginSchema = z.object({
	email: z.email({ error: 'Введите адрес электронной почты' }),
	password: z.string().min(1, { error: 'Введите пароль' }),
	redirectTo: z.string().optional()
});

export const changePasswordSchema = z
	.object({
		currentPassword: z.string().min(1, { error: 'Введите текущий пароль' }),
		newPassword: passwordSchema,
		repeatPassword: z.string()
	})
	.refine((v) => v.newPassword === v.repeatPassword, {
		error: 'Пароли не совпадают',
		path: ['repeatPassword']
	})
	.refine((v) => v.newPassword !== v.currentPassword, {
		error: 'Новый пароль совпадает с текущим',
		path: ['newPassword']
	});

export const requestResetSchema = z.object({
	email: z.email({ error: 'Введите адрес электронной почты' })
});

export const applyResetSchema = z
	.object({
		token: z.string().min(16),
		newPassword: passwordSchema,
		repeatPassword: z.string()
	})
	.refine((v) => v.newPassword === v.repeatPassword, {
		error: 'Пароли не совпадают',
		path: ['repeatPassword']
	});

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ApplyResetInput = z.infer<typeof applyResetSchema>;
