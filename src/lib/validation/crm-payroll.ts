import { z } from 'zod';
import {
	PAYROLL_ADJUSTMENT_MAX_MINOR,
	PAYROLL_QTY_MAX,
	PAYROLL_RATE_MAX_MINOR
} from '$lib/types/crm-payroll';

const id = z.coerce.number().int().positive();

/** 'YYYY-MM-DD' of a real calendar day: the round trip rejects the 31st of February. */
export const payrollDateSchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Выберите дату' })
	.refine(
		(value) => {
			const parsed = Date.parse(`${value}T00:00:00Z`);
			return !Number.isNaN(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
		},
		{ error: 'Такой даты нет' }
	);

const optionalText = (max: number) =>
	z.preprocess(
		(value) => (typeof value === 'string' && value.trim() === '' ? null : (value ?? null)),
		z
			.string()
			.trim()
			.max(max, { error: `Не длиннее ${max} символов` })
			.nullable()
	);

const fullName = z
	.string()
	.trim()
	.min(1, { error: 'Введите ФИО' })
	.max(120, { error: 'Не длиннее 120 символов' });

export const staffCreateSchema = z.object({ fullName, position: optionalText(120) });
export const staffUpdateSchema = staffCreateSchema.extend({ id });

const workTitle = z
	.string()
	.trim()
	.min(1, { error: 'Введите название' })
	.max(120, { error: 'Не длиннее 120 символов' });

/** The price of one unit in kopecks, whole roubles only: `MoneyInput` sends it that way. */
const rateMinor = z.coerce
	.number({ error: 'Введите стоимость' })
	.int({ error: 'Введите стоимость в целых рублях' })
	.min(0, { error: 'Не меньше нуля' })
	.max(PAYROLL_RATE_MAX_MINOR, { error: 'Не больше 1 000 000 ₽' })
	.multipleOf(100, { error: 'Введите стоимость в целых рублях' });

export const workTypeCreateSchema = z.object({ title: workTitle, rateMinor });
export const workTypeUpdateSchema = workTypeCreateSchema.extend({ id });

export const payrollIdSchema = z.object({ id });

const unique = (values: readonly number[]) => new Set(values).size === values.length;

/** A whole day in one write: who worked and how much of each work was done. */
export const workDaySaveSchema = z.object({
	date: payrollDateSchema,
	staffIds: z.array(id).max(200).refine(unique, { error: 'Сотрудник отмечен дважды' }),
	entries: z
		.array(
			z.object({
				workTypeId: id,
				qty: z.coerce
					.number({ error: 'Введите количество' })
					.int({ error: 'Количество должно быть целым' })
					.min(1, { error: 'Не меньше одного' })
					.max(PAYROLL_QTY_MAX, { error: `Не больше ${PAYROLL_QTY_MAX}` })
			})
		)
		.max(200)
		.refine((rows) => unique(rows.map((row) => row.workTypeId)), {
			error: 'Работа указана дважды'
		})
});

const STAFF_PREFIX = 'staff.';
const QTY_PREFIX = 'qty.';

/**
 * The day form sends a ticked `staff.<id>` box per worker and a `qty.<workTypeId>` field per work;
 * an empty or zero quantity means the work was not done that day.
 */
function dayOfForm(value: unknown): unknown {
	if (typeof value !== 'object' || value === null) return value;
	const fields = Object.entries(value);
	return {
		date: fields.find(([key]) => key === 'date')?.[1],
		staffIds: fields
			.filter(([key]) => key.startsWith(STAFF_PREFIX))
			.map(([key]) => key.slice(STAFF_PREFIX.length)),
		entries: fields
			.filter(([key, qty]) => key.startsWith(QTY_PREFIX) && qty !== '' && Number(qty) !== 0)
			.map(([key, qty]) => ({ workTypeId: key.slice(QTY_PREFIX.length), qty }))
	};
}

export const workDayFormSchema = z.preprocess(dayOfForm, workDaySaveSchema);

export const workDayDateSchema = z.object({ date: payrollDateSchema });

/**
 * A signed correction of one worker's week. The form sends the amount and the direction apart,
 * because `MoneyInput` holds no minus; a non-zero correction needs its reason.
 */
export const payrollAdjustSchema = z
	.object({
		week: payrollDateSchema,
		staffId: id,
		direction: z.enum(['plus', 'minus'], { error: 'Выберите вид корректировки' }),
		amountMinor: z.coerce
			.number({ error: 'Введите сумму' })
			.int({ error: 'Введите сумму в целых рублях' })
			.min(0, { error: 'Не меньше нуля' })
			.max(PAYROLL_ADJUSTMENT_MAX_MINOR, { error: 'Не больше 1 000 000 ₽' })
			.multipleOf(100, { error: 'Введите сумму в целых рублях' }),
		comment: optionalText(500)
	})
	.refine((value) => value.amountMinor === 0 || value.comment !== null, {
		path: ['comment'],
		error: 'Напишите, за что корректировка'
	});

export const payrollCloseSchema = z.object({ week: payrollDateSchema });

export const payrollReopenSchema = z.object({
	periodId: id,
	comment: z
		.string()
		.trim()
		.min(1, { error: 'Напишите, зачем открываете неделю' })
		.max(500, { error: 'Не длиннее 500 символов' })
});

export const payrollPaySchema = z.object({ lineId: id, comment: optionalText(500) });
export const payrollUnpaySchema = z.object({ lineId: id });

export const payrollReportSchema = z.object({ from: payrollDateSchema, to: payrollDateSchema });

export type StaffCreateInput = z.infer<typeof staffCreateSchema>;
export type StaffUpdateInput = z.infer<typeof staffUpdateSchema>;
export type WorkTypeCreateInput = z.infer<typeof workTypeCreateSchema>;
export type WorkTypeUpdateInput = z.infer<typeof workTypeUpdateSchema>;
export type WorkDaySaveInput = z.infer<typeof workDaySaveSchema>;
export type PayrollAdjustInput = z.infer<typeof payrollAdjustSchema>;
export type PayrollReopenInput = z.infer<typeof payrollReopenSchema>;
export type PayrollPayInput = z.infer<typeof payrollPaySchema>;
export type PayrollReportInput = z.infer<typeof payrollReportSchema>;
