import { z } from 'zod';

function digits(length: number | readonly number[], error: string) {
	const lengths = typeof length === 'number' ? [length] : length;
	return z
		.string()
		.refine((value) => /^\d+$/.test(value) && lengths.includes(value.length), { error });
}

/** Shape of `settings.org.requisites` (tech.md 5.9, v1.37). Settings are JSON, parsed on read. */
export const orgRequisitesSchema = z.object({
	name: z.string().min(1),
	inn: digits([10, 12], 'ИНН: 10 или 12 цифр').optional(),
	kpp: digits(9, 'КПП: 9 цифр').optional(),
	address: z.string().min(1).optional(),
	phone: z.string().min(1).optional(),
	email: z.email({ error: 'Введите адрес электронной почты' }).optional(),
	bank: z.string().min(1).optional(),
	bik: digits(9, 'БИК: 9 цифр').optional(),
	account: digits(20, 'Расчётный счёт: 20 цифр').optional()
});

export type OrgRequisites = z.infer<typeof orgRequisitesSchema>;

function isKnownTimeZone(timeZone: string): boolean {
	try {
		new Intl.DateTimeFormat('ru-RU', { timeZone });
		return true;
	} catch {
		return false;
	}
}

/** `settings.org.timezone`: an IANA zone the runtime knows, or dates would throw while rendering. */
export const orgTimezoneSchema = z
	.string()
	.min(1, { error: 'Выберите часовой пояс' })
	.refine(isKnownTimeZone, { error: 'Неизвестный часовой пояс' });

/** `settings.charity.rate_bp`: basis points of the request total that go to the fund (tech.md 5.9). */
export const charityRateSchema = z.number().int().min(0).max(10_000);

/** `settings.charity.fund`: the fund the banner names. */
export const charityFundSchema = z.object({
	title: z.string().min(1),
	url: z.url().optional()
});

export type CharityFund = z.infer<typeof charityFundSchema>;

/** `settings.notifications.enabled`: the workshop-wide switch of every notification (P9). */
export const notificationsEnabledSchema = z.boolean();

/** `settings.counterparty.staff_limit_default`: portal seats a new counterparty starts with (v1.37). */
export const staffLimitDefaultSchema = z
	.number({ error: 'Введите число' })
	.int({ error: 'Лимит должен быть целым' })
	.min(1, { error: 'От 1 до 1000' })
	.max(1000, { error: 'От 1 до 1000' });
