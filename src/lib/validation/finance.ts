import { z } from 'zod';
import { checkRange, rangeShape } from './crm-reports';
import {
	FINANCE_COMMENT_MAX,
	FINANCE_ENTRY_MAX_MINOR,
	FINANCE_KINDS,
	FINANCE_SOURCES
} from '$lib/types/finance';

const id = z.coerce.number().int().positive();

// A filter value the page does not know is dropped, not turned into an error: the page still opens.
const knownOrNull = <T extends readonly [string, ...string[]]>(values: T) =>
	z.preprocess(
		(value) => (typeof value === 'string' && values.includes(value) ? value : null),
		z.enum(values).nullable()
	);

const entryShape = {
	kind: z.enum(FINANCE_KINDS, { error: 'Выберите тип' }),
	amountMinor: z.coerce
		.number({ error: 'Введите сумму' })
		.int({ error: 'Введите сумму' })
		.min(1, { error: 'Введите сумму' })
		.max(FINANCE_ENTRY_MAX_MINOR, { error: 'Сумма слишком большая' }),
	// The shape only: whether the day is in the future depends on org.timezone, the service checks it.
	occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Выберите дату' }),
	comment: z
		.string({ error: 'Введите комментарий' })
		.trim()
		.min(1, { error: 'Введите комментарий' })
		.max(FINANCE_COMMENT_MAX, { error: `Не длиннее ${FINANCE_COMMENT_MAX} символов` })
};

export const financeEntrySchema = z.object(entryShape);
export const financeEntryUpdateSchema = z.object({ ...entryShape, id });
export const financeDeleteSchema = z.object({ id });

export const financeFiltersSchema = z
	.object({
		...rangeShape,
		kind: knownOrNull(FINANCE_KINDS),
		source: knownOrNull(FINANCE_SOURCES)
	})
	.superRefine(checkRange);

export type FinanceEntryInput = z.infer<typeof financeEntrySchema>;
export type FinanceEntryUpdateInput = z.infer<typeof financeEntryUpdateSchema>;
export type FinanceDeleteInput = z.infer<typeof financeDeleteSchema>;
export type FinanceFiltersInput = z.infer<typeof financeFiltersSchema>;
