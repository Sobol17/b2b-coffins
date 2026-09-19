import { z } from 'zod';
import { REQUEST_STATUSES } from '$lib/types/request';

const id = z.coerce.number().int().positive();

/** The `[id]` of a request route: user input like any other. */
export const requestIdSchema = id;

export const MAX_LINE_QTY = 999;

/** A day of the calendar, the shape both date pickers of the registry send. */
const isoDate = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Дата в формате ГГГГ-ММ-ДД' })
	.optional();

const qty = z.coerce
	.number({ error: 'Укажите количество' })
	.int({ error: 'Количество должно быть целым' })
	.min(1, { error: 'Не меньше одной штуки' })
	.max(MAX_LINE_QTY, { error: `Не больше ${MAX_LINE_QTY} штук в строке` });

function optionalText(max: number, message: string) {
	return z
		.string()
		.max(max, { error: message })
		.optional()
		.transform((value) => {
			const trimmed = value?.trim() ?? '';
			return trimmed === '' ? null : trimmed;
		});
}

/** A line from the product page. Option ids come as repeated `option` fields of the form. */
export const addDraftItemSchema = z.object({
	variantId: id,
	qty,
	optionIds: z.array(id).max(10).default([])
});

export const draftItemQtySchema = z.object({ itemId: id, qty });
export const draftItemSchema = z.object({ itemId: id });
export const repeatRequestSchema = z.object({ requestId: id });

/** Empty, absent or null all mean "no reference", so a form without the field validates. */
const optionalId = z
	.union([z.literal(''), z.null(), id])
	.optional()
	.transform((value) => (typeof value === 'number' ? value : null));

const deliveryDate = z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional();
const deliveryTime = z.union([z.literal(''), z.string().regex(/^\d{2}:\d{2}$/)]).optional();

/**
 * Delivery and comment, saved with the draft and at submit. A draft may hold a half-filled form:
 * the send is what the server blocks, so a counterparty collects the request in several visits.
 */
export const draftDetailsSchema = z
	.object({
		deliveryAddressId: optionalId,
		deliveryDate,
		deliveryTime,
		deceasedName: optionalText(200, 'ФИО умершего не длиннее 200 символов'),
		comment: optionalText(1000, 'Комментарий не длиннее 1000 символов')
	})
	.transform((value) => ({
		deliveryAddressId: value.deliveryAddressId,
		deliveryAt: localMoment(value.deliveryDate, value.deliveryTime),
		deceasedName: value.deceasedName,
		comment: value.comment
	}));

/** Both halves come from the form; either one missing means the deadline is not set yet. */
function localMoment(date: string | undefined, time: string | undefined): Date | null {
	if (!date || !time) return null;
	const moment = new Date(`${date}T${time}:00`);
	return Number.isNaN(moment.getTime()) ? null : moment;
}

export type AddDraftItemInput = z.infer<typeof addDraftItemSchema>;
export type DraftDetailsInput = z.infer<typeof draftDetailsSchema>;

/** FormData to a plain object, keeping repeated `option` fields as a list. */
export function draftItemForm(form: FormData): Record<string, unknown> {
	return { ...Object.fromEntries(form), optionIds: form.getAll('option') };
}

/** A status move of a sent request. The state machine decides whether the pair is allowed. */
export const requestTransitionSchema = z.object({
	to: z.enum(REQUEST_STATUSES, { error: 'Неизвестный статус' }),
	reasonId: optionalId,
	comment: optionalText(500, 'Комментарий не длиннее 500 символов')
});

export type RequestTransitionInput = z.infer<typeof requestTransitionSchema>;

/** A message of the portal thread with the manager (P6). Internal notes belong to the CRM. */
export const requestCommentSchema = z.object({
	body: z
		.string({ error: 'Напишите сообщение' })
		.trim()
		.min(1, { error: 'Напишите сообщение' })
		.max(2000, { error: 'Сообщение не длиннее 2000 символов' })
});

export type RequestCommentInput = z.infer<typeof requestCommentSchema>;

/** Filters of the registry: chips of statuses and a closed window of dates over the sent moment. */
export const requestFiltersSchema = z.object({
	statuses: z.array(z.enum(REQUEST_STATUSES)).default([]),
	from: isoDate,
	to: isoDate
});

export type RequestFiltersInput = z.infer<typeof requestFiltersSchema>;

/** Query of the registry page: repeated `status` fields plus the period of the date pickers. */
export function requestFiltersFrom(params: URLSearchParams): Record<string, unknown> {
	return {
		statuses: params.getAll('status'),
		from: params.get('from') ?? undefined,
		to: params.get('to') ?? undefined
	};
}
