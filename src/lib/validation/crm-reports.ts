import { z } from 'zod';
import { rangeProblem, type RangeProblem } from '$lib/domain/report/period';
import {
	CHARITY_TRANSFER_MAX_MINOR,
	LOST_STATUSES,
	REPORT_MAX_DAYS,
	SALES_BUCKETS,
	SALES_GROUPS
} from '$lib/types/crm-reports';
import { STOCK_KINDS } from '$lib/types/crm-stock';

const RANGE_MESSAGE: Readonly<Record<RangeProblem, string>> = {
	not_a_date: 'Выберите даты периода',
	reversed: 'Начало периода позже конца',
	too_long: 'Период не длиннее года'
};

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Выберите даты периода' });
const id = z.coerce.number().int().positive();
// An empty query value means "no filter", not a broken one.
const blankToNull = (value: unknown) => (value === '' || value === undefined ? null : value);
const optionalText = (max: number) =>
	z.preprocess(
		(value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null),
		z
			.string()
			.max(max, { error: `Не длиннее ${max} символов` })
			.nullable()
	);

const rangeShape = { from: day, to: day };
const checkRange = (value: { from: string; to: string }, ctx: z.RefinementCtx): void => {
	const problem = rangeProblem(value, REPORT_MAX_DAYS);
	if (problem !== null) {
		ctx.addIssue({ code: 'custom', path: ['to'], message: RANGE_MESSAGE[problem] });
	}
};

export const reportRangeSchema = z.object(rangeShape).superRefine(checkRange);

export const salesReportSchema = z
	.object({
		...rangeShape,
		group: z.enum(SALES_GROUPS).default('counterparty'),
		bucket: z.enum(SALES_BUCKETS).default('month'),
		counterpartyId: z.preprocess(blankToNull, id.nullable())
	})
	.superRefine(checkRange);

export const stockTurnoverSchema = z
	.object({ ...rangeShape, kind: z.preprocess(blankToNull, z.enum(STOCK_KINDS).nullable()) })
	.superRefine(checkRange);

export const lostReportSchema = z
	.object({ ...rangeShape, status: z.preprocess(blankToNull, z.enum(LOST_STATUSES).nullable()) })
	.superRefine(checkRange);

export const charityTransferSchema = z.object({
	amountMinor: z.coerce
		.number({ error: 'Введите сумму' })
		.int({ error: 'Введите сумму' })
		.min(1, { error: 'Введите сумму' })
		.max(CHARITY_TRANSFER_MAX_MINOR, { error: 'Сумма слишком большая' }),
	transferredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Выберите дату перечисления' }),
	documentRef: optionalText(100),
	comment: optionalText(500)
});

export const charityTransferReverseSchema = z.object({
	transferId: id,
	comment: z.string().trim().min(1, { error: 'Напишите причину сторно' }).max(500)
});

export type ReportRangeInput = z.infer<typeof reportRangeSchema>;
export type SalesReportInput = z.infer<typeof salesReportSchema>;
export type StockTurnoverInput = z.infer<typeof stockTurnoverSchema>;
export type LostReportInput = z.infer<typeof lostReportSchema>;
export type CharityTransferInput = z.infer<typeof charityTransferSchema>;
export type CharityTransferReverseInput = z.infer<typeof charityTransferReverseSchema>;
