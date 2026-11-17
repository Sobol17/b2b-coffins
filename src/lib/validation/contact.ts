import { z } from 'zod';

/** Optional phone of a person: empty input means "no phone" and is stored as null. */
export const phoneSchema = z
	.string()
	.trim()
	.regex(/^$|^\+?[\d\s()-]{5,31}$/, { error: 'Телефон: цифры, пробелы, скобки и дефис' })
	.transform((value) => (value === '' ? null : value));

export const fullNameSchema = z
	.string()
	.trim()
	.min(2, { error: 'Укажите имя и фамилию' })
	.max(120, { error: 'Не длиннее 120 символов' });

/** Account identifiers use one spelling across forms, login and uniqueness checks. */
export function normalizeAccountPhone(value: string): string {
	const digits = value.replace(/\D/g, '');
	const international =
		digits.length === 10
			? `7${digits}`
			: digits.length === 11 && digits.startsWith('8')
				? `7${digits.slice(1)}`
				: digits;
	return `+${international}`;
}

export const accountPhoneSchema = z
	.string()
	.trim()
	.regex(/^\+?[\d\s()-]+$/, { error: 'Введите номер телефона' })
	.transform(normalizeAccountPhone)
	.pipe(z.string().regex(/^\+[1-9]\d{9,14}$/, { error: 'Введите номер телефона с кодом страны' }));

export const accountEmailSchema = z.preprocess(
	(value) => (typeof value === 'string' ? value.trim().toLowerCase() || null : (value ?? null)),
	z.email({ error: 'Введите адрес электронной почты' }).nullable()
);
