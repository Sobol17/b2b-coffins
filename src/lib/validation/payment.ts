import { z } from 'zod';
import { PAYMENT_METHODS } from '$lib/types/crm-counterparty';

const COMMENT_MAX = 500;
const TOO_LONG = `Комментарий не длиннее ${COMMENT_MAX} символов`;

const trimmed = (value: unknown) => (typeof value === 'string' ? value.trim() : value);

/**
 * A payment mark of the request card (tech.md v1.44). The amount arrives in kopecks: the form sends
 * whole rubles or the untouched rest, and the service settles it against the rest of the request.
 */
export const paymentMarkSchema = z.object({
	amountMinor: z.coerce
		.number({ error: 'Укажите сумму' })
		.int({ error: 'Укажите сумму' })
		.positive({ error: 'Сумма должна быть больше нуля' }),
	paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Выберите дату оплаты' }),
	method: z.enum(PAYMENT_METHODS, { error: 'Выберите способ оплаты' }),
	comment: z.preprocess(
		(value) => trimmed(value) || null,
		z.string().max(COMMENT_MAX, { error: TOO_LONG }).nullable()
	)
});
export type PaymentMarkInput = z.infer<typeof paymentMarkSchema>;

/** Cancelling a mark always says why: the row stays in the registry next to the mistake. */
export const paymentReverseSchema = z.object({
	markId: z.coerce.number().int().positive(),
	comment: z.preprocess(
		trimmed,
		z
			.string({ error: 'Укажите причину сторно' })
			.min(1, { error: 'Укажите причину сторно' })
			.max(COMMENT_MAX, { error: TOO_LONG })
	)
});
export type PaymentReverseInput = z.infer<typeof paymentReverseSchema>;
