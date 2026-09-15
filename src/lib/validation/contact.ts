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
