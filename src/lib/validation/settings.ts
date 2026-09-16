import { z } from 'zod';

/** Shape of `settings.org.requisites` (tech.md 5.9). Settings are JSON, so they are parsed on read. */
export const orgRequisitesSchema = z.object({
	name: z.string().min(1),
	phone: z.string().min(1).optional(),
	address: z.string().min(1).optional()
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
export const orgTimezoneSchema = z.string().min(1).refine(isKnownTimeZone);

/** `settings.charity.rate_bp`: basis points of the request total that go to the fund (tech.md 5.9). */
export const charityRateSchema = z.number().int().min(0).max(10_000);

/** `settings.charity.fund`: the fund the banner names. */
export const charityFundSchema = z.object({
	title: z.string().min(1),
	url: z.url().optional()
});

export type CharityFund = z.infer<typeof charityFundSchema>;
