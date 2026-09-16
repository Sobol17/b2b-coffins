import { z } from 'zod';
import { REQUEST_STATUSES } from '$lib/types/request';

const id = z.coerce.number().int().positive();

export const MAX_LINE_QTY = 999;

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

/** Delivery, comment and the counterparty's own number, saved with the draft and at submit. */
export const draftDetailsSchema = z
	.object({
		delivery: z
			.union([z.literal('pickup'), z.string().regex(/^address:\d+$/)], {
				error: 'Выберите адрес доставки или самовывоз'
			})
			.optional(),
		comment: optionalText(1000, 'Комментарий не длиннее 1000 символов'),
		externalNumber: optionalText(40, 'Номер не длиннее 40 символов')
	})
	.transform((value) => ({
		deliveryAddressId: value.delivery?.startsWith('address:')
			? Number(value.delivery.slice('address:'.length))
			: null,
		isPickup: value.delivery === 'pickup',
		comment: value.comment,
		externalNumber: value.externalNumber
	}));

export type AddDraftItemInput = z.infer<typeof addDraftItemSchema>;
export type DraftDetailsInput = z.infer<typeof draftDetailsSchema>;

/** FormData to a plain object, keeping repeated `option` fields as a list. */
export function draftItemForm(form: FormData): Record<string, unknown> {
	return { ...Object.fromEntries(form), optionIds: form.getAll('option') };
}

/** Empty, absent or null all mean "no reference", so a form without the field validates. */
const optionalId = z
	.union([z.literal(''), z.null(), id])
	.optional()
	.transform((value) => (typeof value === 'number' ? value : null));

/** A status move of a sent request. The state machine decides whether the pair is allowed. */
export const requestTransitionSchema = z.object({
	to: z.enum(REQUEST_STATUSES, { error: 'Неизвестный статус' }),
	reasonId: optionalId,
	comment: optionalText(500, 'Комментарий не длиннее 500 символов')
});

export type RequestTransitionInput = z.infer<typeof requestTransitionSchema>;
