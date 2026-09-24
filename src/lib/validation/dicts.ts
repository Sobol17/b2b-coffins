import { z } from 'zod';
import { DICT_CODES } from '$lib/types/dicts';

const itemId = z.coerce.number().int().positive();

const title = z
	.string()
	.trim()
	.min(1, { error: 'Введите название' })
	.max(120, { error: 'Не длиннее 120 символов' });

const sortOrder = z.coerce
	.number({ error: 'Введите число' })
	.int({ error: 'Порядок должен быть целым' })
	.min(0, { error: 'Не меньше нуля' })
	.max(100_000, { error: 'Не больше 100 000' });

/**
 * The code is what fixtures, imports and seeds refer to (`dict_items` unique on dict and code), so it
 * stays latin and never changes after creation: only the title and the order are editable.
 */
export const createDictItemSchema = z.object({
	dict: z.enum(DICT_CODES, { error: 'Выберите справочник' }),
	code: z
		.string()
		.trim()
		.toLowerCase()
		.regex(/^[a-z0-9_]{1,40}$/, { error: 'Латиница, цифры и подчёркивание, до 40 символов' }),
	title,
	sortOrder
});

export const updateDictItemSchema = z.object({ id: itemId, title, sortOrder });

export const dictItemIdSchema = z.object({ id: itemId });

/** The open dictionary of the screen. A tampered value falls back to the first one. */
export const dictFiltersSchema = z.object({
	dict: z.enum(DICT_CODES).catch(DICT_CODES[0])
});

export type CreateDictItemInput = z.infer<typeof createDictItemSchema>;
export type UpdateDictItemInput = z.infer<typeof updateDictItemSchema>;
