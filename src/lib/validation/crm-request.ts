import { z } from 'zod';
import { ATTENTION_FLAGS } from '$lib/types/crm-request';
import { REQUEST_PRIORITIES, REQUEST_STATUSES } from '$lib/types/request';
import { MAX_LINE_QTY, requestTransitionSchema } from './request';

const id = z.coerce.number().int().positive();

/** At most this many lines in the creation form: a longer order is a sign of a wrong import. */
export const MAX_CREATE_LINES = 30;

function trimmedOrNull(value: unknown): unknown {
	if (value === undefined || value === null) return null;
	if (typeof value !== 'string') return value;
	const trimmed = value.trim();
	return trimmed === '' ? null : trimmed;
}

const optionalText = (max: number, message: string) =>
	z.preprocess(trimmedOrNull, z.string().max(max, { error: message }).nullable());

const optionalId = z.preprocess(
	(value) => (value === '' || value === undefined ? null : value),
	id.nullable()
);

const qty = z.coerce
	.number({ error: 'Укажите количество' })
	.int({ error: 'Количество должно быть целым' })
	.min(1, { error: 'Не меньше одной штуки' })
	.max(MAX_LINE_QTY, { error: `Не больше ${MAX_LINE_QTY} штук в строке` });

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Выберите дату' });
const clock = z.string().regex(/^\d{2}:\d{2}$/, { error: 'Укажите время' });

/**
 * The reason of a change. The service decides whether it is required: in `new` nothing is fixed
 * yet, in `in_work` every change of the lines needs one (tech.md v1.40).
 */
export const changeCommentSchema = optionalText(500, 'Комментарий не длиннее 500 символов');

/** Filters from the query string. A tampered value is dropped, not turned into a 422 page. */
export const crmRequestFiltersSchema = z
	.object({
		status: z.enum(REQUEST_STATUSES).optional().catch(undefined),
		counterparty: z
			.union([z.literal('stock'), id])
			.optional()
			.catch(undefined),
		priority: z.enum(REQUEST_PRIORITIES).optional().catch(undefined),
		flag: z.enum(ATTENTION_FLAGS).optional().catch(undefined),
		from: isoDate.optional().catch(undefined),
		to: isoDate.optional().catch(undefined)
	})
	.transform(({ counterparty, ...rest }) => ({
		...rest,
		counterpartyId: typeof counterparty === 'number' ? counterparty : undefined,
		stockOnly: counterparty === 'stock' ? true : undefined
	}));

const lineSchema = z.object({ variantId: id, optionId: optionalId, qty });

/**
 * The creation form of the workshop. A counterparty request carries the whole delivery block, the
 * way the cart does; a stock request has no counterparty and no delivery at all.
 */
export const crmRequestCreateSchema = z
	.object({
		kind: z.enum(['counterparty', 'stock'], { error: 'Выберите, для кого заявка' }),
		counterpartyId: optionalId,
		deliveryAddressId: optionalId,
		deliveryDate: z.preprocess(trimmedOrNull, isoDate.nullable()),
		deliveryTime: z.preprocess(trimmedOrNull, clock.nullable()),
		deceasedName: optionalText(200, 'ФИО умершего не длиннее 200 символов'),
		priority: z.enum(REQUEST_PRIORITIES).default('normal'),
		comment: optionalText(1000, 'Комментарий не длиннее 1000 символов'),
		lines: z
			.array(lineSchema)
			.min(1, { error: 'Добавьте хотя бы одну позицию' })
			.max(MAX_CREATE_LINES, { error: `Не больше ${MAX_CREATE_LINES} позиций` })
	})
	.superRefine((value, ctx) => {
		if (value.kind === 'stock') return;
		const missing: [keyof typeof value, string][] = [
			['counterpartyId', 'Выберите контрагента'],
			['deliveryAddressId', 'Выберите адрес доставки'],
			['deliveryDate', 'Укажите дату доставки'],
			['deliveryTime', 'Укажите время доставки'],
			['deceasedName', 'Укажите ФИО умершего']
		];
		for (const [field, message] of missing) {
			if (value[field] === null) ctx.addIssue({ code: 'custom', path: [field], message });
		}
	});

export type CrmRequestCreateInput = z.infer<typeof crmRequestCreateSchema>;

/** FormData to a plain object: the lines come as index-aligned repeated fields. */
export function crmRequestCreateForm(form: FormData): Record<string, unknown> {
	const variants = form.getAll('variantId');
	const options = form.getAll('optionId');
	const quantities = form.getAll('qty');
	return {
		...Object.fromEntries(form),
		lines: variants.map((variantId, index) => ({
			variantId,
			optionId: options[index] ?? '',
			qty: quantities[index]
		}))
	};
}

export const addLineSchema = z.object({
	variantId: id,
	optionId: optionalId,
	qty,
	comment: changeCommentSchema
});

export const lineQtySchema = z.object({ itemId: id, qty, comment: changeCommentSchema });
export const removeLineSchema = z.object({ itemId: id, comment: changeCommentSchema });

export const prioritySchema = z.object({
	priority: z.enum(REQUEST_PRIORITIES, { error: 'Выберите приоритет' })
});

/** A card dropped on another column of the board. The state machine decides the rest. */
export const boardMoveSchema = requestTransitionSchema.extend({ id });

export type AddLineInput = z.infer<typeof addLineSchema>;
export type LineQtyInput = z.infer<typeof lineQtySchema>;
export type RemoveLineInput = z.infer<typeof removeLineSchema>;
