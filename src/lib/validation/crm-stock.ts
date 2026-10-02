import { z } from 'zod';
import {
	MANUAL_MOVE_TYPES,
	STOCK_KINDS,
	STOCK_MOVE_MAX,
	type StockFilters
} from '$lib/types/crm-stock';
import { STOCK_MOVE_TYPES } from '$lib/types/dicts';
import { checkbox } from './fields';

const id = z.coerce.number().int().positive();

/** An empty field means "not set" and is stored as null, never as an empty string. */
function blankToNull(value: unknown): unknown {
	if (value === undefined || value === null) return null;
	if (typeof value !== 'string') return value;
	const trimmed = value.trim();
	return trimmed === '' ? null : trimmed;
}

const nullableId = z.preprocess(blankToNull, id.nullable());
const comment = z.preprocess(
	blankToNull,
	z.string().max(500, { error: 'Не длиннее 500 символов' }).nullable()
);
const flag = z.preprocess((value) => value === 'true' || value === true, z.boolean());

/** Filters of the registry. A tampered value is dropped, not turned into a 422 page. */
export const stockFiltersSchema = z
	.object({
		kind: z.enum(STOCK_KINDS).optional().catch(undefined),
		belowThreshold: flag.optional(),
		negative: flag.optional(),
		activeOnly: flag.optional()
	})
	.transform((value): StockFilters => ({
		...(value.kind === undefined ? {} : { kind: value.kind }),
		...(value.belowThreshold ? { belowThreshold: true } : {}),
		...(value.negative ? { negative: true } : {}),
		...(value.activeOnly ? { activeOnly: true } : {})
	}));

export const stockJournalFiltersSchema = z
	.object({ type: z.enum(STOCK_MOVE_TYPES).optional().catch(undefined) })
	.transform((value) => (value.type === undefined ? {} : { type: value.type }));
export type StockJournalFilters = z.infer<typeof stockJournalFiltersSchema>;

const itemFields = {
	code: z
		.string({ error: 'Введите код' })
		.trim()
		.min(1, { error: 'Введите код' })
		.max(40, { error: 'Код не длиннее 40 символов' }),
	title: z
		.string({ error: 'Введите название' })
		.trim()
		.min(1, { error: 'Введите название' })
		.max(160, { error: 'Название не длиннее 160 символов' }),
	unitId: id.catch(0).refine((value) => value > 0, { error: 'Выберите единицу' }),
	minThreshold: z.coerce
		.number({ error: 'Введите порог' })
		.int({ error: 'Порог должен быть целым' })
		.min(0, { error: 'Порог не бывает отрицательным' })
		.max(STOCK_MOVE_MAX, { error: `Не больше ${STOCK_MOVE_MAX}` })
};

export const stockItemCreateSchema = z.object({
	kind: z.enum(STOCK_KINDS, { error: 'Выберите вид' }),
	...itemFields
});
export type StockItemCreateInput = z.infer<typeof stockItemCreateSchema>;

/** The kind stays as created: moves and norms already hang on it (tech.md v1.45). */
export const stockItemUpdateSchema = z.object({ ...itemFields, isActive: checkbox });
export type StockItemUpdateInput = z.infer<typeof stockItemUpdateSchema>;

/** One manual move: a purchase or an adjustment, the quantity signed as on the shelf. */
export const stockMoveSchema = z.object({
	type: z.enum(MANUAL_MOVE_TYPES, { error: 'Выберите тип движения' }),
	// An empty field is the colourless position, not a missing value.
	optionId: nullableId,
	qty: z.coerce
		.number({ error: 'Введите количество' })
		.int({ error: 'Количество должно быть целым' })
		.min(-STOCK_MOVE_MAX, { error: `Не больше ${STOCK_MOVE_MAX} за раз` })
		.max(STOCK_MOVE_MAX, { error: `Не больше ${STOCK_MOVE_MAX} за раз` }),
	reasonId: nullableId,
	comment
});
export type StockMoveInput = z.infer<typeof stockMoveSchema>;

export const stockReverseSchema = z.object({ moveId: id });

export const inventoryCreateSchema = z.object({
	kind: z.enum(STOCK_KINDS, { error: 'Выберите вид' }),
	comment
});
export type InventoryCreateInput = z.infer<typeof inventoryCreateSchema>;

// An empty field is a missing count, not a zero: coercion would quietly write the shelf off.
const actualQty = z.preprocess(
	(value) => (typeof value === 'string' && value.trim() !== '' ? Number(value) : value),
	z
		.number({ error: 'Введите факт по каждой строке' })
		.int({ error: 'Факт должен быть целым' })
		.min(0, { error: 'Факт не бывает отрицательным' })
		.max(STOCK_MOVE_MAX, { error: `Не больше ${STOCK_MOVE_MAX} в строке` })
);

const ACTUAL_PREFIX = 'actual.';

/** The form sends one `actual.<lineId>` field per line; anything else in the body is ignored. */
function countedLines(value: unknown): unknown {
	if (typeof value !== 'object' || value === null) return value;
	const entries = Object.entries(value);
	return {
		comment: entries.find(([key]) => key === 'comment')?.[1],
		lines: entries
			.filter(([key]) => key.startsWith(ACTUAL_PREFIX))
			.map(([key, qty]) => ({ lineId: key.slice(ACTUAL_PREFIX.length), actualQty: qty }))
	};
}

export const inventorySaveSchema = z.preprocess(
	countedLines,
	z.object({
		comment,
		lines: z.array(z.object({ lineId: id, actualQty }))
	})
);
export type InventorySaveInput = z.infer<typeof inventorySaveSchema>;
