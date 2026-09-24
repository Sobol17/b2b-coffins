import { z } from 'zod';
import type { SettlementScheme } from '$lib/types/counterparty';
import { fullNameSchema, phoneSchema } from './contact';
import { orgRequisitesSchema } from './settings';

const SCHEMES = ['on_fact', 'weekly', 'monthly'] as const satisfies readonly SettlementScheme[];

const id = z.coerce.number().int().positive();

/** An empty field means "not set" and is stored as null, never as an empty string. */
function blankToNull(value: unknown): unknown {
	if (value === undefined || value === null) return null;
	if (typeof value !== 'string') return value;
	const trimmed = value.trim();
	return trimmed === '' ? null : trimmed;
}

const optional = <T extends z.ZodType>(inner: T) => z.preprocess(blankToNull, inner.nullable());
const text = (max: number) => z.string().max(max, { error: `Не длиннее ${max} символов` });
const nullableId = optional(id);
const checkbox = z.preprocess(
	(value) => value === 'on' || value === 'true' || value === true,
	z.boolean()
);

// A calendar date from DatePicker. The round trip rejects the 31st of February.
function isCalendarDay(value: string): boolean {
	const time = Date.parse(`${value}T00:00:00Z`);
	return !Number.isNaN(time) && new Date(time).toISOString().startsWith(value);
}

const day = optional(
	z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Выберите дату' })
		.refine(isCalendarDay, { error: 'Выберите дату' })
);

// Stored lower-cased: the login form and the uniqueness check must agree on one spelling.
const loginEmail = z
	.string()
	.trim()
	.toLowerCase()
	.pipe(z.email({ error: 'Введите адрес электронной почты' }));

const requisitesShape = {
	name: z
		.string()
		.trim()
		.min(1, { error: 'Введите название' })
		.max(200, { error: 'Не длиннее 200 символов' }),
	legalName: optional(text(300)),
	inn: optional(orgRequisitesSchema.shape.inn.unwrap()),
	kpp: optional(orgRequisitesSchema.shape.kpp.unwrap()),
	address: optional(text(300)),
	phone: optional(text(40)),
	email: optional(z.email({ error: 'Введите адрес электронной почты' }))
};

const termsShape = {
	priceListId: nullableId,
	discountPercent: z.coerce
		.number({ error: 'Введите процент' })
		.int({ error: 'Скидка: целое число процентов' })
		.min(0, { error: 'Не меньше 0 %' })
		.max(100, { error: 'Не больше 100 %' }),
	settlementScheme: z.enum(SCHEMES, { error: 'Выберите схему расчётов' }),
	managerId: nullableId
};

export const requisitesInputSchema = z.object(requisitesShape);

export const termsInputSchema = z.object({
	...termsShape,
	staffLimit: z.coerce
		.number({ error: 'Введите число' })
		.int({ error: 'Введите целое число' })
		.min(1, { error: 'Не меньше 1' })
		.max(1000, { error: 'Не больше 1000' })
});

export const notesInputSchema = z.object({ notes: optional(text(5000)) });

/** A new portal administrator issued by the workshop. The counterparty comes from the route. */
export const issueAdminSchema = z.object({
	fullName: fullNameSchema,
	email: loginEmail,
	phone: phoneSchema
});

/**
 * One form creates the counterparty and its first administrator (tech.md v1.39). The staff limit
 * is not asked: a new counterparty takes `counterparty.staff_limit_default`.
 */
export const createCounterpartySchema = z
	.object({
		...requisitesShape,
		...termsShape,
		adminFullName: fullNameSchema,
		adminEmail: loginEmail,
		adminPhone: phoneSchema
	})
	.transform(({ adminFullName, adminEmail, adminPhone, ...rest }) => ({
		requisites: {
			name: rest.name,
			legalName: rest.legalName,
			inn: rest.inn,
			kpp: rest.kpp,
			address: rest.address,
			phone: rest.phone,
			email: rest.email
		},
		terms: {
			priceListId: rest.priceListId,
			discountPercent: rest.discountPercent,
			settlementScheme: rest.settlementScheme,
			managerId: rest.managerId
		},
		admin: { fullName: adminFullName, email: adminEmail, phone: adminPhone }
	}));

export const contractInputSchema = z
	.object({
		number: z
			.string()
			.trim()
			.min(1, { error: 'Введите номер договора' })
			.max(50, { error: 'Не длиннее 50 символов' }),
		signedAt: day,
		validUntil: day
	})
	.refine(
		(value) =>
			value.signedAt === null || value.validUntil === null || value.signedAt <= value.validUntil,
		{ error: 'Договор не может закончиться раньше подписания', path: ['validUntil'] }
	);

export const addressInputSchema = z.object({
	title: z
		.string()
		.trim()
		.min(1, { error: 'Введите название адреса' })
		.max(120, { error: 'Не длиннее 120 символов' }),
	address: z
		.string()
		.trim()
		.min(1, { error: 'Введите адрес' })
		.max(300, { error: 'Не длиннее 300 символов' }),
	contactName: optional(text(120)),
	contactPhone: phoneSchema.optional().transform((value) => value ?? null),
	isDefault: checkbox
});

export const entityIdSchema = z.object({ id });

/** Filters from the query string. A tampered value is dropped, not turned into a 422 page. */
export const counterpartyFiltersSchema = z.object({
	managerId: id.optional().catch(undefined),
	scheme: z.enum(SCHEMES).optional().catch(undefined),
	hasDebt: z
		.enum(['true'])
		.transform(() => true)
		.optional()
		.catch(undefined)
});

export type RequisitesInput = z.infer<typeof requisitesInputSchema>;
export type TermsInput = z.infer<typeof termsInputSchema>;
export type IssueAdminInput = z.infer<typeof issueAdminSchema>;
export type CreateCounterpartyInput = z.infer<typeof createCounterpartySchema>;
export type ContractInput = z.infer<typeof contractInputSchema>;
export type AddressInput = z.infer<typeof addressInputSchema>;
