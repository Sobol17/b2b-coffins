import { z } from 'zod';
import { WORK_ROLES } from '$lib/types/roles';
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

// An empty select is a general work, not a missing answer.
const roleCode = z.preprocess(
	(value) => (value === '' || value === undefined ? null : value),
	z.enum(WORK_ROLES, { error: 'Выберите роль' }).nullable()
);

export const workTypeCreateSchema = z.object({ title: workTitle, rateMinor, roleCode });
export const workTypeUpdateSchema = workTypeCreateSchema.extend({ id });

export const payrollIdSchema = z.object({ id });

const unique = (values: readonly number[]) => new Set(values).size === values.length;

const crewKey = (entry: { workTypeId: number; staffIds: readonly number[] }) =>
	`${entry.workTypeId}:${[...entry.staffIds].sort((a, b) => a - b).join(',')}`;

/**
 * A whole day in one write: who came, and for each work how much was done and by whom (v1.55).
 * The same work may come twice when two crews did it, but never twice with the same crew.
 */
export const workDaySaveSchema = z
	.object({
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
						.max(PAYROLL_QTY_MAX, { error: `Не больше ${PAYROLL_QTY_MAX}` }),
					staffIds: z
						.array(id)
						.min(1, { error: 'Отметьте, кто сделал работу' })
						.max(200)
						.refine(unique, { error: 'Исполнитель отмечен дважды' })
				})
			)
			.max(200)
			.refine((rows) => new Set(rows.map(crewKey)).size === rows.length, {
				error: 'Работа с тем же составом указана дважды'
			})
	})
	.refine(
		(day) =>
			day.entries.every((entry) =>
				entry.staffIds.every((staffId) => day.staffIds.includes(staffId))
			),
		{ path: ['entries'], error: 'Исполнитель работы не отмечен среди тех, кто работал' }
	);

const STAFF_PREFIX = 'staff.';
const ENTRY_FIELD = /^entry\.(\d+)\.(work|qty|staff\.(\d+))$/;

interface EntryFields {
	workTypeId?: unknown;
	qty?: unknown;
	staffIds: string[];
}

/**
 * The day form sends a ticked `staff.<id>` box per worker who came, and a row per work:
 * `entry.<n>.work`, `entry.<n>.qty` and a ticked `entry.<n>.staff.<id>` box per crew member.
 * A row with an empty or zero quantity means the work was not done and is dropped.
 */
function dayOfForm(value: unknown): unknown {
	if (typeof value !== 'object' || value === null) return value;
	const fields = Object.entries(value);
	const rows = new Map<string, EntryFields>();
	for (const [key, field] of fields) {
		const match = ENTRY_FIELD.exec(key);
		if (!match?.[1]) continue;
		const row = rows.get(match[1]) ?? { staffIds: [] };
		if (match[2] === 'work') row.workTypeId = field;
		else if (match[2] === 'qty') row.qty = field;
		else if (match[3]) row.staffIds.push(match[3]);
		rows.set(match[1], row);
	}
	return {
		date: fields.find(([key]) => key === 'date')?.[1],
		staffIds: fields
			.filter(([key]) => key.startsWith(STAFF_PREFIX))
			.map(([key]) => key.slice(STAFF_PREFIX.length)),
		entries: [...rows.values()].filter(
			(row) => row.qty !== undefined && row.qty !== '' && Number(row.qty) !== 0
		)
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
