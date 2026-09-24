import { z } from 'zod';
import { NUMBERING_PERIODS } from '$lib/types/crm';
import {
	charityFundSchema,
	orgRequisitesSchema,
	orgTimezoneSchema,
	staffLimitDefaultSchema
} from './settings';

/** An empty field of the form means "not set": the key is left out of the stored JSON. */
function blankToUndefined(value: unknown): unknown {
	if (typeof value !== 'string') return value;
	const trimmed = value.trim();
	return trimmed === '' ? undefined : trimmed;
}

const blank = <T extends z.ZodType>(inner: T) => z.preprocess(blankToUndefined, inner);

/** Requisites form of the CRM settings. The stored shape is `orgRequisitesSchema`. */
export const requisitesFormSchema = z.object({
	name: blank(
		z.string({ error: 'Введите название' }).max(200, { error: 'Не длиннее 200 символов' })
	),
	inn: blank(orgRequisitesSchema.shape.inn),
	kpp: blank(orgRequisitesSchema.shape.kpp),
	address: blank(z.string().max(300, { error: 'Не длиннее 300 символов' }).optional()),
	phone: blank(z.string().max(40, { error: 'Не длиннее 40 символов' }).optional()),
	email: blank(orgRequisitesSchema.shape.email),
	bank: blank(z.string().max(200, { error: 'Не длиннее 200 символов' }).optional()),
	bik: blank(orgRequisitesSchema.shape.bik),
	account: blank(orgRequisitesSchema.shape.account)
});

export const timezoneFormSchema = z.object({
	timezone: z.string().trim().pipe(orgTimezoneSchema)
});

/**
 * The owner types a percent with up to two decimals; the setting keeps basis points
 * (`charity.rate_bp`), so 1,5 % is stored as 150 and no float reaches the database.
 */
const ratePercent = z
	.string()
	.trim()
	.transform((value) => value.replace(',', '.'))
	.refine((value) => /^\d{1,3}(\.\d{1,2})?$/.test(value), {
		error: 'Введите процент, например 1,5'
	})
	.transform((value) => Math.round(Number(value) * 100))
	.pipe(z.number().max(10_000, { error: 'Не больше 100 %' }));

export const charityFormSchema = z.object({
	rateBp: ratePercent,
	fundTitle: z
		.string()
		.trim()
		.min(1, { error: 'Введите название фонда' })
		.max(200, { error: 'Не длиннее 200 символов' }),
	fundUrl: blank(charityFundSchema.shape.url.unwrap().optional())
});

export const staffLimitFormSchema = z.object({
	staffLimitDefault: z.coerce.number({ error: 'Введите число' }).pipe(staffLimitDefaultSchema)
});

export const numberingFormSchema = z.object({
	prefix: z
		.string()
		.trim()
		.regex(/^[\p{L}\p{N}./-]{0,10}$/u, {
			error: 'До 10 символов: буквы, цифры, точка, дефис, косая'
		}),
	period: z.enum(NUMBERING_PERIODS, { error: 'Выберите период' })
});

export type RequisitesForm = z.infer<typeof requisitesFormSchema>;
export type CharityForm = z.infer<typeof charityFormSchema>;
export type NumberingForm = z.infer<typeof numberingFormSchema>;
